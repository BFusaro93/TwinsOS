-- Snow: salt / materials are recorded and billed PER STORM.
--
-- A snow job's planned products (crm_job_products, job-level rows) were never
-- billed — the visit auto-invoice and Create Invoice skip snow jobs, and Snow
-- Invoicing never read products — and the crew could record usage only once
-- per season (recording resolves the job-level row for good).
--
-- Now the job-level row is the per-storm plan ("10 bags of salt each storm").
-- Each storm visit records its OWN usage as a per-visit copy of that row
-- (visit_id = the storm visit, template_job_product_id = the plan row), priced
-- from the plan row; the plan row itself stays pending for the next storm.
-- Recording 'used' decrements inventory for that storm (set_job_product_status),
-- and Snow Invoicing adds every 'used' per-visit row as a line on that storm's
-- invoice, claiming it through invoice_line_item_id (a voided invoice frees it).
--
-- crew_record_storm_visit_product does the copy + resolve in one transaction,
-- as the caller (so inventory adjustments and the audit name the crew login).
-- crm_job_compute_totals leaves the per-storm rows out of the job's value — the
-- plan row already prices one storm, and the job value is a plan figure.

alter table public.crm_job_products
  add column if not exists template_job_product_id uuid
    references public.crm_job_products(id) on delete set null;

comment on column public.crm_job_products.template_job_product_id is
  'Snow: the job-level plan row this per-storm usage row was recorded from (visit_id = the storm visit).';

create unique index if not exists crm_job_products_storm_visit_template_unique
  on public.crm_job_products (visit_id, template_job_product_id)
  where template_job_product_id is not null and deleted_at is null;

create or replace function public.crew_record_storm_visit_product(
  p_visit_id uuid,
  p_template_id uuid,
  p_status text,
  p_qty numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      uuid := public.my_org_id();
  v_visit    record;
  v_tpl      record;
  v_qty      numeric;
  v_id       uuid;
begin
  if v_org is null or auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not coalesce((select public.has_crm_access()), false)
     or (select public.my_org_is_read_only()) is true then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_status not in ('used', 'used_no_invoice', 'not_used') then
    raise exception 'A storm material is recorded as used, used (don''t bill) or not used.'
      using errcode = 'check_violation';
  end if;

  select v.id, v.job_id, v.crew_id, v.crew_unassigned, j.job_type, j.crew_id as job_crew_id
    into v_visit
    from public.crm_job_visits v
    join public.crm_jobs j on j.id = v.job_id
   where v.id = p_visit_id
     and v.org_id = v_org
     and v.deleted_at is null;
  if not found then
    raise exception 'Visit not found' using errcode = 'P0002';
  end if;
  if v_visit.job_type is distinct from 'snow' then
    raise exception 'Only a snow visit records materials per storm.' using errcode = 'check_violation';
  end if;

  -- A crew login: only its own crew's visit (the effective crew — the job's
  -- crew when the visit has none). The route checks this too.
  if coalesce(public.my_role(), '') = 'crew'
     and (case when v_visit.crew_unassigned then null else coalesce(v_visit.crew_id, v_visit.job_crew_id) end)
         not in (select public.my_crew_ids()) then
    raise exception 'Not assigned to this visit' using errcode = '42501';
  end if;

  select id, org_id, job_id, product_id, product_name, qty, planned_qty, unit_price_cents,
         unit_cost_cents, job_service_id, notes
    into v_tpl
    from public.crm_job_products
   where id = p_template_id
     and org_id = v_org
     and job_id = v_visit.job_id
     and visit_id is null
     and template_job_product_id is null
     and job_service_subitem_id is null
     and deleted_at is null
     and status = 'pending';
  if not found then
    raise exception 'Material not found on this job' using errcode = 'P0002';
  end if;

  -- Billed already: Snow Invoicing only adds a storm's materials with that
  -- storm's own invoice line, so usage recorded afterwards would never bill.
  if p_status = 'used' and exists (
    select 1
      from public.crm_invoice_line_items li
      join public.crm_invoices i on i.id = li.invoice_id
     where li.visit_id = p_visit_id
       and i.deleted_at is null
       and i.status <> 'void'
  ) then
    raise exception 'This storm visit is already invoiced — tell the office what you used so they can add it.'
      using errcode = 'check_violation';
  end if;

  if p_status = 'not_used' then
    v_qty := coalesce(v_tpl.planned_qty, v_tpl.qty);
  else
    if p_qty is null or p_qty <= 0 then
      raise exception 'Enter how much was used.' using errcode = 'check_violation';
    end if;
    v_qty := p_qty;
  end if;

  insert into public.crm_job_products (
    org_id, job_id, visit_id, template_job_product_id, product_id, product_name,
    qty, planned_qty, unit_price_cents, unit_cost_cents, job_service_id, notes,
    status, created_by
  ) values (
    v_org, v_visit.job_id, p_visit_id, p_template_id, v_tpl.product_id, v_tpl.product_name,
    v_qty, coalesce(v_tpl.planned_qty, v_tpl.qty), v_tpl.unit_price_cents, v_tpl.unit_cost_cents,
    v_tpl.job_service_id, v_tpl.notes, 'pending', auth.uid()
  )
  returning id into v_id;

  -- Inventory leaves stock here, once per storm (pending -> used states).
  perform public.set_job_product_status(v_id, p_status);
  return v_id;
end;
$$;

revoke all on function public.crew_record_storm_visit_product(uuid, uuid, text, numeric) from public, anon;
grant execute on function public.crew_record_storm_visit_product(uuid, uuid, text, numeric) to authenticated, service_role;

-- Job value: per-storm usage rows are copies of the plan row, so they don't
-- add to the job's product total. Body is the live definition plus that filter.
create or replace function public.crm_job_compute_totals(
  p_job_id uuid, p_rate_cents integer, p_job_type text,
  out service_total_cents integer, out product_total_cents integer
)
returns record
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_service_lines integer;
begin
  select coalesce(sum(round(
           coalesce(s.qty, 1) * coalesce(s.rate_cents, 0)
           * greatest(1, coalesce(
               s.max_visits,
               case when p_job_type = 'recurring' then li.visits end,
               1))
         ))::integer, 0),
         count(*)
    into service_total_cents, v_service_lines
    from crm_job_services s
    left join estimate_line_items li on li.id = s.estimate_line_item_id
   where s.job_id = p_job_id
     and coalesce(s.included, true);

  if v_service_lines = 0 then
    service_total_cents := coalesce(p_rate_cents, 0);
  end if;

  select coalesce(sum(round(coalesce(p.qty, 0) * coalesce(p.unit_price_cents, 0)))::integer, 0)
    into product_total_cents
    from crm_job_products p
   where p.job_id = p_job_id
     and p.deleted_at is null
     and p.template_job_product_id is null
     and coalesce(p.status, 'pending') not in ('not_used', 'used_no_invoice');
end;
$function$;

notify pgrst, 'reload schema';
