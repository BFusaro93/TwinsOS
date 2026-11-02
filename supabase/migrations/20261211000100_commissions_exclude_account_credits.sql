-- Commissions on the "paid" basis counted account-credit payments (crm_payments.is_credit,
-- e.g. a goodwill credit applied to an invoice) as cash received, while AR write-offs were
-- excluded. Only money actually received earns commission (user decision 2026-11-02).
-- Applying an existing prepayment is unaffected: that allocation sits on the ORIGINAL
-- (real-money) payment, not on an is_credit row.
--
-- Note: a statement line already frozen on a credit allocation no longer has a live basis,
-- so the clawback preview offers to reverse it on the rep's next statement.
--
-- Bodies are the latest definitions (20261029000100 / 20261101000200) plus the is_credit filter.

create or replace function public.crm_commission_lines(
  p_from date, p_to date, p_employee_id uuid default null
)
returns table (
  ev_key text, employee_id uuid, employee_name text, plan_id uuid, plan_name text,
  invoice_id uuid, invoice_number integer, client_id uuid, client_name text,
  service_name text, category text, sale_type text, earned_on text, event_date date,
  basis_cents integer, rate_bps integer, commission_cents integer, statement_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.my_org_id();
  v_me  uuid;
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select id into v_me from crm_employees where user_id = auth.uid() and deleted_at is null limit 1;
  if not (public.has_settings_permission('commission_view')
          or public.has_settings_permission('commission_manage')
          or (p_employee_id is not null and p_employee_id = v_me)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with inv as (
    select i.id, i.invoice_number, i.client_id, i.invoice_date, i.total_cents, i.tax_cents,
           coalesce(i.sales_rep_id, j.sales_rep_id, k.sales_rep_id, e.sales_rep_id, c.sales_rep_id) as rep_id,
           coalesce(i.sale_type, j.sale_type, k.sale_type, e.sale_type, 'new') as sale_type,
           c.display_name as client_name
    from crm_invoices i
    left join crm_jobs j on j.id = i.crm_job_id
    left join crm_contracts k on k.id = i.contract_id
    left join estimates e on e.id = i.estimate_id
    left join clients c on c.id = i.client_id
    where i.org_id = v_org and i.deleted_at is null
      and i.status not in ('draft','void') and i.total_cents > 0
  ),
  ln as (
    select l.id as line_id, l.invoice_id, l.service_id, sv.name as service_name, lower(sv.category) as category,
           greatest(l.total_cents - l.discount_cents, 0) as net,
           sum(greatest(l.total_cents - l.discount_cents, 0)) over (partition by l.invoice_id) as net_sum
    from crm_invoice_line_items l
    left join crm_services sv on sv.id = l.service_id
    where l.org_id = v_org
  ),
  ev as (
    select 'pay:' || a.id::text || ':' || ln.line_id::text as ev_key, 'paid'::text as earned_on,
           p.payment_date as event_date,
           round(a.amount_cents::numeric * (inv.total_cents - inv.tax_cents) / inv.total_cents * ln.net / ln.net_sum)::int as basis,
           inv.id as inv_id, inv.invoice_number, inv.client_id, inv.client_name, inv.rep_id, inv.sale_type,
           ln.service_id, ln.service_name, ln.category
    from inv
    join ln on ln.invoice_id = inv.id and ln.net_sum > 0
    join crm_payment_allocations a on a.invoice_id = inv.id
    join crm_payments p on p.id = a.payment_id and p.deleted_at is null and p.method <> 'AR Write-off'
      and not coalesce(p.is_credit, false)
    where p.payment_date between p_from and p_to
    union all
    select 'inv:' || inv.id::text || ':' || ln.line_id::text, 'invoiced', inv.invoice_date,
           round((inv.total_cents - inv.tax_cents)::numeric * ln.net / ln.net_sum)::int,
           inv.id, inv.invoice_number, inv.client_id, inv.client_name, inv.rep_id, inv.sale_type,
           ln.service_id, ln.service_name, ln.category
    from inv
    join ln on ln.invoice_id = inv.id and ln.net_sum > 0
    where inv.invoice_date between p_from and p_to
  ),
  matched as (
    select distinct on (ev.ev_key, emp.id)
      ev.ev_key, emp.id as employee_id, (emp.first_name || ' ' || emp.last_name) as employee_name,
      pl.id as plan_id, pl.name as plan_name,
      ev.inv_id as invoice_id, ev.invoice_number, ev.client_id, ev.client_name,
      ev.service_name, ev.category, ev.sale_type, ev.earned_on, ev.event_date, ev.basis, r.rate_bps
    from ev
    join crm_employees emp on emp.id = ev.rep_id and emp.org_id = v_org
    join crm_commission_assignments asg on asg.employee_id = emp.id and asg.deleted_at is null
      and ev.event_date >= asg.effective_from
      and (asg.effective_to is null or ev.event_date <= asg.effective_to)
    join crm_commission_plans pl on pl.id = asg.plan_id and pl.deleted_at is null and pl.is_active
    join crm_commission_plan_rules r on r.plan_id = pl.id and r.deleted_at is null
      and r.earned_on = ev.earned_on
      and r.sale_type in ('any', ev.sale_type)
      and (r.service_id is null or r.service_id = ev.service_id)
      and (r.category is null or lower(r.category) = ev.category)
    where p_employee_id is null or emp.id = p_employee_id
    order by ev.ev_key, emp.id,
             (r.service_id is not null) desc, (r.category is not null) desc,
             (r.sale_type <> 'any') desc, r.rate_bps desc
  )
  select m.ev_key, m.employee_id, m.employee_name, m.plan_id, m.plan_name,
         m.invoice_id, m.invoice_number, m.client_id, m.client_name,
         m.service_name, m.category, m.sale_type, m.earned_on, m.event_date,
         m.basis, m.rate_bps, round(m.basis::numeric * m.rate_bps / 10000)::int,
         sl.statement_id
  from matched m
  left join crm_commission_statement_lines sl
    on sl.org_id = v_org and sl.employee_id = m.employee_id and sl.ev_key = m.ev_key and sl.is_active
  order by m.employee_name, m.event_date, m.invoice_number;
end;
$$;

revoke all on function public.crm_commission_lines(date, date, uuid) from public, anon;
grant execute on function public.crm_commission_lines(date, date, uuid) to authenticated;

create or replace function public.crm_commission_live_basis(p_org uuid)
returns table (ev_key text, basis integer)
language sql
stable
security definer
set search_path = public
as $$
  with inv as (
    select i.id, i.total_cents, i.tax_cents
    from crm_invoices i
    where i.org_id = p_org and i.deleted_at is null
      and i.status not in ('draft','void') and i.total_cents > 0
  ),
  ln as (
    select l.id as line_id, l.invoice_id,
           greatest(l.total_cents - l.discount_cents, 0) as net,
           sum(greatest(l.total_cents - l.discount_cents, 0)) over (partition by l.invoice_id) as net_sum
    from crm_invoice_line_items l
    where l.org_id = p_org
  )
  select 'pay:' || a.id::text || ':' || ln.line_id::text,
         round(a.amount_cents::numeric * (inv.total_cents - inv.tax_cents) / inv.total_cents * ln.net / ln.net_sum)::int
  from inv
  join ln on ln.invoice_id = inv.id and ln.net_sum > 0
  join crm_payment_allocations a on a.invoice_id = inv.id
  join crm_payments p on p.id = a.payment_id and p.deleted_at is null and p.method <> 'AR Write-off'
    and not coalesce(p.is_credit, false)
  union all
  select 'inv:' || inv.id::text || ':' || ln.line_id::text,
         round((inv.total_cents - inv.tax_cents)::numeric * ln.net / ln.net_sum)::int
  from inv
  join ln on ln.invoice_id = inv.id and ln.net_sum > 0;
$$;
revoke all on function public.crm_commission_live_basis(uuid) from public, anon, authenticated;
