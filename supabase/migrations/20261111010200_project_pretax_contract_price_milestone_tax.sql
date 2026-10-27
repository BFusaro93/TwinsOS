-- Project contract price is PRE-tax; tax is added when a milestone invoice is
-- created.
--
-- Converting an estimate to a project used to seed original_contract_price from
-- the estimate's tax-INCLUSIVE total, and create_invoice_from_milestone billed
-- percent milestones against it with no tax line. The client therefore paid the
-- tax inside the "price" with nothing recorded as tax, and WIP / remaining-to-
-- bill (which net tax out of billed) disagreed with the contract price.
--
-- New model for a project flagged contract_price_is_pretax:
--   * contract_price (= original + approved change orders) is before tax.
--   * a percent milestone = percent of that pre-tax price.
--   * the milestone invoice adds tax at the same rate a normal invoice would:
--     the linked estimate's tax_rate_bps when > 0, else the client's
--     default_tax_rate_bps (0 => tax-exempt / untaxed => no tax added).
--     The invoice's line is flagged taxable so later recalcs keep the tax.
--   * a FLAT milestone carried over from an estimate (estimate_id set) is a
--     literal gross figure entered against the estimate's tax-inclusive total,
--     so it is billed as entered with no tax added (adding tax would charge it
--     twice). A flat milestone created on the project itself is pre-tax and
--     gets tax added.
--
-- EXISTING PROJECTS ARE NOT REWRITTEN. The new flag is backfilled false for every
-- row that exists when this runs, so their contract prices (which include tax),
-- their milestones and their invoices behave exactly as before. Only projects
-- created after this migration default to true. If the office wants a legacy
-- project moved to the pre-tax model it is a deliberate per-project change
-- (set original_contract_price to the pre-tax figure AND contract_price_is_pretax
-- = true); see the optional, commented-out review query at the bottom.

alter table public.projects
  add column if not exists contract_price_is_pretax boolean not null default false;

-- Existing rows keep false (set by the add-column default above); rows created
-- from now on are pre-tax.
alter table public.projects
  alter column contract_price_is_pretax set default true;

comment on column public.projects.contract_price_is_pretax is
  'true: contract_price excludes tax; milestone invoices add tax. false (legacy): contract_price already includes tax and milestone invoices add none.';

create or replace function public.create_invoice_from_milestone(
  p_milestone_id uuid,
  p_client_id    uuid,
  p_sales_rep_id uuid default null,
  p_po_number    text default null
)
returns table(invoice_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id      uuid;
  v_estimate_id uuid;
  v_project_id  uuid;
  v_name        text;
  v_amount      integer;
  v_status      text;
  v_type        text;
  v_value       integer;
  v_basis       integer;
  v_invoice_id  uuid;
  v_deleted_at  timestamptz;
  v_client_id   uuid;
  v_est_client  uuid;
  v_proj_client uuid;
  v_terms       text;
  v_inv_date    date;
  v_days        integer;
  v_pretax      boolean := false;
  v_est_rate    integer;
  v_client_rate integer;
  v_tax_rate    integer := 0;
  v_tax         integer := 0;
begin
  select org_id, estimate_id, project_id, name, amount_cents, status, milestone_type, milestone_value, deleted_at
    into v_org_id, v_estimate_id, v_project_id, v_name, v_amount, v_status, v_type, v_value, v_deleted_at
    from public.estimate_milestones
    where id = p_milestone_id
    for update;

  if not found then
    raise exception 'Milestone not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  if v_deleted_at is not null then
    raise exception 'Milestone has been deleted';
  end if;

  if v_status = 'invoiced' then
    raise exception 'Milestone already invoiced';
  end if;

  if v_project_id is null and v_estimate_id is not null then
    select j.project_id into v_project_id
    from public.crm_jobs j
    where j.estimate_id = v_estimate_id
      and j.project_id is not null
      and j.deleted_at is null
    limit 1;
  end if;

  if v_estimate_id is not null then
    declare
      v_est_deleted timestamptz;
      v_est_stage   text;
      v_est_org     uuid;
    begin
      select deleted_at, stage, org_id, client_id, tax_rate_bps
        into v_est_deleted, v_est_stage, v_est_org, v_est_client, v_est_rate
        from public.estimates where id = v_estimate_id;
      if not found or v_est_deleted is not null then
        raise exception 'Milestone''s estimate has been deleted';
      end if;
      if v_est_org is distinct from v_org_id then
        raise exception 'Unauthorized';
      end if;
      if v_est_stage = 'lost' then
        raise exception 'Cannot invoice a milestone on a lost estimate';
      end if;
    end;
  end if;

  if v_project_id is not null then
    declare
      v_proj_deleted timestamptz;
      v_proj_org     uuid;
    begin
      select deleted_at, org_id, client_id, contract_price_is_pretax
        into v_proj_deleted, v_proj_org, v_proj_client, v_pretax
        from public.projects where id = v_project_id;
      if not found or v_proj_deleted is not null then
        raise exception 'Milestone''s project has been deleted';
      end if;
      if v_proj_org is distinct from v_org_id then
        raise exception 'Unauthorized';
      end if;
    end;
  end if;

  v_client_id := coalesce(v_est_client, v_proj_client);
  if v_client_id is null then
    if not exists (
      select 1 from public.clients c
      where c.id = p_client_id and c.org_id = v_org_id and c.deleted_at is null
    ) then
      raise exception 'Invalid client for this milestone';
    end if;
    v_client_id := p_client_id;
  elsif p_client_id is not null and p_client_id is distinct from v_client_id then
    raise exception 'Client does not match the milestone''s estimate/project';
  end if;

  if v_type = 'percent' then
    if v_project_id is not null then
      select contract_price into v_basis from public.projects where id = v_project_id;
    else
      select total_cents into v_basis from public.estimates where id = v_estimate_id;
    end if;

    if coalesce(v_basis, 0) > 0 then
      v_amount := round(v_basis::numeric * v_value / 10000);
    end if;
  end if;

  if coalesce(v_amount, 0) <= 0 then
    raise exception 'Milestone amount must be greater than zero';
  end if;

  -- Tax, pre-tax projects only. Same precedence as every other invoice path
  -- (resolveAutoInvoiceTaxRateBps): the estimate's rate when set, else the
  -- client's default rate; 0 means exempt/untaxed. A flat milestone carried
  -- from an estimate is a literal gross figure, so it is left untaxed.
  if v_pretax and (v_type = 'percent' or v_estimate_id is null) then
    select default_tax_rate_bps into v_client_rate from public.clients where id = v_client_id;
    v_tax_rate := least(10000, greatest(0, case when coalesce(v_est_rate, 0) > 0 then v_est_rate else coalesce(v_client_rate, 0) end));
    v_tax := round(v_amount::numeric * v_tax_rate / 10000);
  end if;

  select terms into v_terms from (
    select c.default_terms as terms, 1 as pri from public.clients c where c.id = v_client_id
    union all
    select o.default_billing_terms, 2 from public.organizations o where o.id = v_org_id
  ) t
  where terms in ('due_on_receipt','net_10','net_15','net_30','net_45','net_60','net_90')
  order by pri
  limit 1;
  v_terms := coalesce(v_terms, 'due_on_receipt');
  v_days := case v_terms
    when 'net_10' then 10 when 'net_15' then 15 when 'net_30' then 30
    when 'net_45' then 45 when 'net_60' then 60 when 'net_90' then 90
    else 0 end;
  v_inv_date := public.org_today(v_org_id);

  insert into public.crm_invoices (
    org_id, created_by, client_id, estimate_id, project_id, sales_rep_id, description,
    invoice_date, terms, due_date, po_number,
    subtotal_cents, tax_rate_bps, tax_cents, total_cents, balance_cents, status
  ) values (
    v_org_id, auth.uid(), v_client_id, v_estimate_id, v_project_id, p_sales_rep_id, v_name,
    v_inv_date, v_terms, v_inv_date + v_days,
    p_po_number, v_amount, v_tax_rate, v_tax, v_amount + v_tax, v_amount + v_tax, 'draft'
  )
  returning id into v_invoice_id;

  insert into public.crm_invoice_line_items (
    org_id, invoice_id, name, description, qty, rate_cents, total_cents, is_taxable, sort_order
  ) values (
    v_org_id, v_invoice_id, v_name, '', 1, v_amount, v_amount, v_tax > 0, 0
  );

  -- amount_cents stays the PRE-tax milestone amount.
  update public.estimate_milestones
  set status = 'invoiced', invoice_id = v_invoice_id, amount_cents = v_amount
  where id = p_milestone_id;

  return query select v_invoice_id;
end;
$$;

revoke execute on function public.create_invoice_from_milestone(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.create_invoice_from_milestone(uuid, uuid, uuid, text) to authenticated;

-- ── OPTIONAL data fix for existing projects — NOT APPLIED, review first ──────
-- Legacy converted-from-estimate projects hold a tax-inclusive original contract
-- price. To list them (pre-tax candidate = the source estimate's revenue_cents):
--
--   select p.id, p.name, p.original_contract_price, e.revenue_cents as pretax_candidate, e.tax_cents
--   from public.projects p
--   join public.crm_jobs j on j.project_id = p.id and j.estimate_id is not null
--   join public.estimates e on e.id = j.estimate_id
--   where p.deleted_at is null
--     and p.contract_price_is_pretax = false
--     and p.original_contract_price = e.total_cents
--     and e.tax_cents > 0;
--
-- Moving one to the pre-tax model (only if no milestone has been invoiced yet,
-- otherwise billed-vs-price history would shift):
--
--   update public.projects
--   set original_contract_price = <pretax_candidate>, contract_price_is_pretax = true
--   where id = '<project id>';
