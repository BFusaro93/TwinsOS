-- Milestone invoices lost their tax. 20261111010200 made create_invoice_from_milestone add tax for
-- pre-tax projects; 20261111020000 then re-created the function from the older body to add the
-- acct permission check, silently dropping that logic (the same drop/create regression as the
-- price-run permission check). This restates BOTH: the permission check and the tax logic.
--
-- Also new: a milestone billed against an estimate's tax-inclusive total (percent of it, or a flat
-- gross figure carried over) still bills the same amount, but the invoice now records the tax
-- portion it contains (tax_cents / tax_rate_bps, a taxable line), so tax reports and the
-- QuickBooks tax push match what the client was quoted. amount_cents stays the milestone amount.
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
  v_est_tax     integer;
  v_est_total   integer;
  v_net         integer;
begin
  if not public._acct_permitted(array['acct_add_modify_invoices']) then
    raise exception 'You do not have permission to invoice a milestone' using errcode = '42501';
  end if;
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
      select deleted_at, stage, org_id, client_id, tax_rate_bps, tax_cents, total_cents
        into v_est_deleted, v_est_stage, v_est_org, v_est_client, v_est_rate, v_est_tax, v_est_total
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

  -- A milestone billed against an estimate's tax-INCLUSIVE total (percent of it, or a flat gross
  -- figure) bills the same amount as before, but records the tax portion it contains: without
  -- it the invoice showed no tax, and the tax reports and the QuickBooks tax push under-counted.
  v_net := v_amount;
  -- (Not for a percent milestone of a pre-tax project: that amount is pre-tax and an exempt client
  -- owes none.)
  if v_tax = 0 and v_estimate_id is not null and not (v_pretax and v_type = 'percent')
     and coalesce(v_est_tax, 0) > 0 and coalesce(v_est_total, 0) > 0 then
    v_tax := least(v_amount, round(v_amount::numeric * v_est_tax / v_est_total));
    v_tax_rate := least(10000, greatest(0, coalesce(v_est_rate, 0)));
    v_net := v_amount - v_tax;
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
    p_po_number, v_net, v_tax_rate, v_tax, v_net + v_tax, v_net + v_tax, 'draft'
  )
  returning id into v_invoice_id;

  insert into public.crm_invoice_line_items (
    org_id, invoice_id, name, description, qty, rate_cents, total_cents, is_taxable, sort_order
  ) values (
    v_org_id, v_invoice_id, v_name, '', 1, v_net, v_net, v_tax > 0, 0
  );

  -- amount_cents stays the PRE-tax milestone amount.
  update public.estimate_milestones
  set status = 'invoiced', invoice_id = v_invoice_id, amount_cents = v_amount
  where id = p_milestone_id;

  return query select v_invoice_id;
end;
$$;

revoke all on function public.create_invoice_from_milestone(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.create_invoice_from_milestone(uuid,uuid,uuid,text) to authenticated, service_role;
