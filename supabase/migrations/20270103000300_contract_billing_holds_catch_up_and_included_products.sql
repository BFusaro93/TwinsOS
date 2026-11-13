-- Contracts & packages billing (bug sweep round 13).
--
-- 1. crm_contracts.reactivated_at — when the contract was last switched from
--    inactive back to active (Make Active). Billing resumes at the NEXT cycle
--    after reactivation: the cycle in progress is not billed again (visits
--    during the pause, and until that next cycle, bill per visit). Stamped by
--    a trigger only; the audit trail does not record is_active changes, so
--    nothing can be backfilled.
-- 2. crm_invoices.catch_up_period_start/_end — marks a "missed cycles"
--    catch-up invoice (one invoice, dated the day it is created, with one
--    line per earlier cycle the contract never billed because it was signed
--    late). Like the prorated stub, it is NOT the regular invoice of any
--    cycle window, so the billing paths' "already billed this period" checks
--    ignore it.
-- 3. crm_invoices_one_per_contract_date now covers only REGULAR contract
--    invoices. A late prorated first-period stub and a catch-up invoice are
--    dated the day they are created, which can be the same day as that day's
--    regular invoice. Each gets its own backstop instead: one live stub per
--    contract, one live catch-up per contract + span start.
-- 4. crm_job_products.included_in_contract — on a job linked to a contract,
--    an included material bills only the quantity used ABOVE what was
--    planned (planned_qty); an un-included one bills in full, on a per-visit
--    invoice, even though the contract covers the services. Ignored on jobs
--    with no contract.
-- 5. crm_duplicate_void_invoice copies the catch-up span, as it already does
--    the proration span — otherwise a duplicated catch-up would look like the
--    regular invoice of the current cycle and stop it from billing.
--
-- PROD: apply BEFORE the code deploys (the new code selects these columns).
-- Pre-check (must return no rows, else the stub index cannot build):
--   select contract_id, count(*) from crm_invoices
--    where deleted_at is null and status <> 'void' and contract_id is not null
--      and proration_period_start is not null
--    group by 1 having count(*) > 1;

-- ── 1. reactivation stamp ────────────────────────────────────────────────────
alter table public.crm_contracts
  add column if not exists reactivated_at timestamptz;

comment on column public.crm_contracts.reactivated_at is
  'When is_active last went false -> true (Make Active). Contract billing resumes at the first cycle starting on/after this day; trigger-maintained.';

create or replace function public.crm_contracts_track_reactivation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.reactivated_at := null;
  elsif coalesce(old.is_active, true) = false and new.is_active = true then
    new.reactivated_at := now();
  else
    -- Only this trigger writes it: a direct write can't move the rail.
    new.reactivated_at := old.reactivated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_contracts_track_reactivation on public.crm_contracts;
create trigger trg_crm_contracts_track_reactivation
  before insert or update on public.crm_contracts
  for each row execute function public.crm_contracts_track_reactivation();

-- ── 2. catch-up invoice span ─────────────────────────────────────────────────
alter table public.crm_invoices
  add column if not exists catch_up_period_start date,
  add column if not exists catch_up_period_end date;

comment on column public.crm_invoices.catch_up_period_start is
  'Set on a contract "missed cycles" catch-up invoice: first day of the earliest cycle it bills. Not a regular cycle invoice.';
comment on column public.crm_invoices.catch_up_period_end is
  'Set on a contract "missed cycles" catch-up invoice: last day of the latest cycle it bills.';

alter table public.crm_invoices drop constraint if exists crm_invoices_catch_up_period_check;
alter table public.crm_invoices add constraint crm_invoices_catch_up_period_check check (
  (catch_up_period_start is null and catch_up_period_end is null)
  or (catch_up_period_start is not null and catch_up_period_end is not null
      and catch_up_period_start <= catch_up_period_end and contract_id is not null)
);

-- ── 3. per-date backstop for regular contract invoices only ──────────────────
drop index if exists public.crm_invoices_one_per_contract_date;
create unique index crm_invoices_one_per_contract_date
  on public.crm_invoices (contract_id, invoice_date)
  where deleted_at is null and contract_id is not null
    and proration_period_start is null and catch_up_period_start is null;

create unique index if not exists crm_invoices_one_prorated_stub_per_contract
  on public.crm_invoices (contract_id)
  where deleted_at is null and status <> 'void' and contract_id is not null
    and proration_period_start is not null;

create unique index if not exists crm_invoices_one_catch_up_per_contract_span
  on public.crm_invoices (contract_id, catch_up_period_start)
  where deleted_at is null and status <> 'void' and catch_up_period_start is not null;

-- ── 4. included-in-contract materials ───────────────────────────────────────
alter table public.crm_job_products
  add column if not exists included_in_contract boolean not null default true;

comment on column public.crm_job_products.included_in_contract is
  'Only read when the job is linked to a contract that covers the visit: true bills just the quantity used above planned_qty; false bills the full quantity per visit.';

-- ── 5. duplicate a void invoice: keep the catch-up span ─────────────────────
CREATE OR REPLACE FUNCTION public.crm_duplicate_void_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_src        record;
  v_line       record;
  v_new_id     uuid;
  v_new_line   uuid;
  v_visit      uuid;
  v_jp         record;
  v_today      date;
  v_days       integer;
  v_visits     integer := 0;
  v_materials  integer := 0;
  v_milestones integer := 0;
  v_lines      integer := 0;
begin
  if not public._acct_permitted(array['acct_add_modify_invoices']) then
    raise exception 'You do not have permission to create invoices' using errcode = '42501';
  end if;
  if coalesce(public.my_role(), '') = 'crew' then
    raise exception 'You do not have permission to create invoices' using errcode = '42501';
  end if;

  select * into v_src
    from public.crm_invoices
    where id = p_invoice_id
    for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if public._org_mismatch(v_src.org_id) then
    raise exception 'Unauthorized';
  end if;
  if v_src.status is distinct from 'void' then
    raise exception 'Only a void invoice can be duplicated as a draft';
  end if;
  if v_src.deleted_at is not null or v_src.consolidated_into_id is not null then
    raise exception 'This invoice was merged into another invoice or deleted, so its work is already billed there';
  end if;

  v_today := public.org_today(v_src.org_id);
  v_days := case v_src.terms
    when 'net_10' then 10 when 'net_15' then 15 when 'net_30' then 30
    when 'net_45' then 45 when 'net_60' then 60 when 'net_90' then 90
    else 0 end;

  insert into public.crm_invoices (
    org_id, created_by, client_id, estimate_id, crm_job_id, contract_id, project_id,
    description, status, invoice_date, due_date, terms, po_number,
    subtotal_cents, discount_cents, discount_type, discount_value, applied_discount_id,
    tax_rate_bps, tax_cents, total_cents, amount_paid_cents, balance_cents,
    notes, service_address, preferred_payment_method, sales_rep_id, sale_type,
    pdf_template_id, proration_period_start, proration_period_end, catch_up_period_start, catch_up_period_end, locked
  ) values (
    v_src.org_id, auth.uid(), v_src.client_id, v_src.estimate_id, v_src.crm_job_id, v_src.contract_id, v_src.project_id,
    v_src.description, 'draft', v_today, v_today + v_days, v_src.terms, v_src.po_number,
    coalesce(v_src.subtotal_cents, 0), coalesce(v_src.discount_cents, 0), v_src.discount_type, v_src.discount_value, v_src.applied_discount_id,
    coalesce(v_src.tax_rate_bps, 0), coalesce(v_src.tax_cents, 0), coalesce(v_src.total_cents, 0), 0, coalesce(v_src.total_cents, 0),
    v_src.notes, v_src.service_address, v_src.preferred_payment_method, v_src.sales_rep_id, v_src.sale_type,
    v_src.pdf_template_id, v_src.proration_period_start, v_src.proration_period_end, v_src.catch_up_period_start, v_src.catch_up_period_end, false
  )
  returning id into v_new_id;

  for v_line in
    select * from public.crm_invoice_line_items
      where invoice_id = p_invoice_id
      order by sort_order nulls last, created_at, id
  loop
    -- The visit's billed tag, only while nothing else has billed it since.
    v_visit := coalesce(v_line.visit_id, v_line.released_visit_id);
    if v_visit is not null and (
         exists (select 1 from public.crm_invoice_line_items l where l.visit_id = v_visit)
         or not exists (select 1 from public.crm_job_visits v where v.id = v_visit and v.deleted_at is null)
       ) then
      v_visit := null;
    end if;

    insert into public.crm_invoice_line_items (
      org_id, invoice_id, name, description, qty, rate_cents, total_cents, sort_order,
      is_taxable, service_date, hours, men, discount_cents, discount_type, discount_value,
      applied_discount_id, visit_id, product_id, service_id, is_other_charge
    ) values (
      v_src.org_id, v_new_id, v_line.name, v_line.description, v_line.qty, v_line.rate_cents, v_line.total_cents, v_line.sort_order,
      v_line.is_taxable, v_line.service_date, v_line.hours, v_line.men, v_line.discount_cents, v_line.discount_type, v_line.discount_value,
      v_line.applied_discount_id, v_visit, v_line.product_id, v_line.service_id, v_line.is_other_charge
    )
    returning id into v_new_line;
    v_lines := v_lines + 1;
    if v_visit is not null then
      v_visits := v_visits + 1;
    end if;

    -- Materials the void sent back to pending still point at the void line;
    -- one billed again since points at that newer line instead.
    for v_jp in
      select id from public.crm_job_products
        where invoice_line_item_id = v_line.id
          and status in ('pending', 'used')
          and deleted_at is null
        order by created_at, id
        for update
    loop
      update public.crm_job_products set invoice_line_item_id = v_new_line where id = v_jp.id;
      perform public.set_job_product_status(v_jp.id, 'invoiced');
      v_materials := v_materials + 1;
    end loop;
  end loop;

  update public.estimate_milestones
     set status = 'invoiced', invoice_id = v_new_id, released_invoice_id = null
   where released_invoice_id = p_invoice_id
     and status = 'pending'
     and invoice_id is null
     and deleted_at is null;
  get diagnostics v_milestones = row_count;

  return jsonb_build_object(
    'invoice_id', v_new_id,
    'lines', v_lines,
    'visits_relinked', v_visits,
    'materials_relinked', v_materials,
    'milestones_relinked', v_milestones
  );
end;
$function$;


