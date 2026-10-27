-- Clawback adjustment lines were dated with current_date (the UTC day), so one
-- generated after ~8 PM Eastern was dated tomorrow on the org's calendar. Use the
-- caller's org day. Body is otherwise identical to 20261101000200.
create or replace function public.crm_commission_create_statement(
  p_employee_id uuid, p_from date, p_to date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.my_org_id();
  v_id  uuid;
  v_n   bigint;
  v_basis bigint;
  v_comm  bigint;
  v_cn    bigint;
  v_cbasis bigint;
  v_ccomm  bigint;
begin
  if v_org is null or not public.has_settings_permission('commission_manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to < p_from then raise exception 'period end is before start'; end if;
  if not exists (select 1 from crm_employees where id = p_employee_id and org_id = v_org) then
    raise exception 'employee not found';
  end if;

  select count(*), coalesce(sum(basis_cents), 0), coalesce(sum(commission_cents), 0)
  into v_n, v_basis, v_comm
  from public.crm_commission_lines(p_from, p_to, p_employee_id)
  where statement_id is null;

  select count(*), coalesce(sum(basis_cents), 0), coalesce(sum(commission_cents), 0)
  into v_cn, v_cbasis, v_ccomm
  from public.crm_commission_pending_clawbacks(p_employee_id);

  if v_n + v_cn = 0 then
    raise exception 'no unclaimed commission lines in this period';
  end if;

  -- Totals go in with the INSERT: the guard trigger freezes them afterwards.
  insert into crm_commission_statements
    (org_id, employee_id, period_start, period_end, total_basis_cents, total_commission_cents, created_by)
  values (v_org, p_employee_id, p_from, p_to, v_basis + v_cbasis, v_comm + v_ccomm, auth.uid())
  returning id into v_id;

  insert into crm_commission_statement_lines
    (org_id, statement_id, employee_id, ev_key, invoice_id, invoice_number, client_name, plan_name,
     service_name, category, sale_type, earned_on, event_date, basis_cents, rate_bps, commission_cents)
  select v_org, v_id, l.employee_id, l.ev_key, l.invoice_id, l.invoice_number, l.client_name, l.plan_name,
         l.service_name, l.category, l.sale_type, l.earned_on, l.event_date, l.basis_cents, l.rate_bps, l.commission_cents
  from public.crm_commission_lines(p_from, p_to, p_employee_id) l
  where l.statement_id is null;

  insert into crm_commission_statement_lines
    (org_id, statement_id, employee_id, ev_key, source_ev_key, invoice_id, invoice_number, client_name, plan_name,
     service_name, category, sale_type, earned_on, event_date, basis_cents, rate_bps, commission_cents)
  select v_org, v_id, c.employee_id, c.claw_ev_key, c.source_ev_key, c.invoice_id, c.invoice_number, c.client_name,
         c.plan_name, 'Adjustment: ' || coalesce(c.service_name, 'refund / void'), c.category, c.sale_type,
         c.earned_on, public.my_today(), c.basis_cents, c.rate_bps, c.commission_cents
  from public.crm_commission_pending_clawbacks(p_employee_id) c;
  return v_id;
end;
$$;

revoke all on function public.crm_commission_create_statement(uuid, date, date) from public, anon;
grant execute on function public.crm_commission_create_statement(uuid, date, date) to authenticated;
