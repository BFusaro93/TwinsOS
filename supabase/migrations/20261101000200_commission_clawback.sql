-- Commission clawback.
--
-- A statement freezes each earning line at the basis it had when the statement
-- was created (ev_key pay:<allocation>:<line> / inv:<invoice>:<line>). A later
-- refund (allocations shrink), payment delete, invoice void/un-issue, or invoice
-- line edit lowers the LIVE basis for that ev_key, but the frozen line stays at
-- the old figure, so the rep stayed overpaid.
--
-- Clawback is net-based so it is idempotent and self-correcting. For every
-- active, non-void statemented line K and each rep:
--     target  = max(frozen_basis - live_basis(K), 0)
--     already = - sum(basis of active claw lines for K)
--     delta   = target - already
-- A non-zero delta becomes ONE new adjustment line (negative basis/commission if
-- the shortfall grew, positive if a refund was reversed or an invoice un-voided).
-- Re-running yields delta = 0, so it is generated once per shortfall amount, and
-- further refunds only add the incremental difference. If the statement that
-- held K is voided (so K is claimable again at its live basis), any claw lines
-- left on other statements are offset the same way (target = 0).
-- The adjustment uses the rate frozen on the original line, not the current
-- rule, so editing a plan never creates phantom clawbacks. Adjustments are
-- picked up by the next crm_commission_create_statement for that rep, whatever
-- period it covers.

alter table public.crm_commission_statement_lines
  add column if not exists source_ev_key text;

create index if not exists idx_crm_commission_line_source
  on public.crm_commission_statement_lines (org_id, employee_id, source_ev_key)
  where is_active and source_ev_key is not null;

-- Current basis for every commissionable event, independent of plan/rule/rep
-- matching and of any date window. Internal helper (no direct grants).
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
  union all
  select 'inv:' || inv.id::text || ':' || ln.line_id::text,
         round((inv.total_cents - inv.tax_cents)::numeric * ln.net / ln.net_sum)::int
  from inv
  join ln on ln.invoice_id = inv.id and ln.net_sum > 0;
$$;
revoke all on function public.crm_commission_live_basis(uuid) from public, anon, authenticated;

-- Adjustment lines the next statement for a rep would carry (preview + source
-- of truth for create_statement).
create or replace function public.crm_commission_pending_clawbacks(p_employee_id uuid default null)
returns table (
  claw_ev_key text, source_ev_key text, employee_id uuid,
  invoice_id uuid, invoice_number integer, client_name text, plan_name text,
  service_name text, category text, sale_type text, earned_on text,
  basis_cents integer, rate_bps integer, commission_cents integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
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
  with live as (
    select lb.ev_key as k, lb.basis as b from public.crm_commission_live_basis(v_org) lb
  ),
  frozen as (
    select sl.employee_id as emp, sl.ev_key as k, sl.basis_cents as b, sl.rate_bps as r,
           sl.invoice_id as inv_id, sl.invoice_number as inv_no, sl.client_name as cn, sl.plan_name as pn,
           sl.service_name as sn, sl.category as cat, sl.sale_type as st, sl.earned_on as eo
    from crm_commission_statement_lines sl
    join crm_commission_statements s on s.id = sl.statement_id and s.status <> 'void'
    where sl.org_id = v_org and sl.is_active and sl.source_ev_key is null
      and (p_employee_id is null or sl.employee_id = p_employee_id)
  ),
  claws as (
    select sl.employee_id as emp, sl.source_ev_key as k,
           sum(sl.basis_cents)::bigint as clawed, count(*)::int as n,
           (array_agg(sl.rate_bps order by sl.created_at desc))[1] as r,
           (array_agg(sl.invoice_id order by sl.created_at desc))[1] as inv_id,
           (array_agg(sl.invoice_number order by sl.created_at desc))[1] as inv_no,
           (array_agg(sl.client_name order by sl.created_at desc))[1] as cn,
           (array_agg(sl.plan_name order by sl.created_at desc))[1] as pn,
           (array_agg(sl.service_name order by sl.created_at desc))[1] as sn,
           (array_agg(sl.category order by sl.created_at desc))[1] as cat,
           (array_agg(sl.sale_type order by sl.created_at desc))[1] as st,
           (array_agg(sl.earned_on order by sl.created_at desc))[1] as eo
    from crm_commission_statement_lines sl
    where sl.org_id = v_org and sl.is_active and sl.source_ev_key is not null
      and (p_employee_id is null or sl.employee_id = p_employee_id)
    group by sl.employee_id, sl.source_ev_key
  ),
  j as (
    select coalesce(f.emp, c.emp) as emp, coalesce(f.k, c.k) as k,
           case when f.k is not null then greatest(f.b - coalesce(lv.b, 0), 0) else 0 end as target,
           coalesce(-c.clawed, 0) as already,
           coalesce(c.n, 0) as n,
           coalesce(f.r, c.r) as r,
           coalesce(f.inv_id, c.inv_id) as inv_id, coalesce(f.inv_no, c.inv_no) as inv_no,
           coalesce(f.cn, c.cn) as cn, coalesce(f.pn, c.pn) as pn,
           coalesce(f.sn, c.sn) as sn, coalesce(f.cat, c.cat) as cat,
           coalesce(f.st, c.st) as st, coalesce(f.eo, c.eo) as eo
    from frozen f
    full join claws c on c.emp = f.emp and c.k = f.k
    left join live lv on lv.k = coalesce(f.k, c.k)
  )
  select 'claw:' || j.k || ':' || (j.n + 1)::text, j.k, j.emp,
         j.inv_id, j.inv_no, j.cn, j.pn, j.sn, j.cat, j.st, j.eo,
         (-(j.target - j.already))::int, j.r,
         round((-(j.target - j.already))::numeric * j.r / 10000)::int
  from j
  where j.target - j.already <> 0
  order by j.inv_no, j.k;
end;
$$;

-- Freeze a period for one employee: claims every unclaimed line in range, plus
-- any outstanding clawback adjustments (which are not tied to the period).
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
         c.earned_on, current_date, c.basis_cents, c.rate_bps, c.commission_cents
  from public.crm_commission_pending_clawbacks(p_employee_id) c;
  return v_id;
end;
$$;

revoke all on function public.crm_commission_pending_clawbacks(uuid) from public, anon;
revoke all on function public.crm_commission_create_statement(uuid, date, date) from public, anon;
grant execute on function public.crm_commission_pending_clawbacks(uuid) to authenticated;
grant execute on function public.crm_commission_create_statement(uuid, date, date) to authenticated;
