-- Commissions: the rep is the rep at the time the invoice is issued, every earning line is
-- paid once, and a statement picks up earlier earnings nobody claimed yet.
--
-- 1. The earning rep was resolved live (invoice → job → contract → estimate → client), so
--    reassigning a client (or editing an issued invoice's Sales Rep) after a statement let
--    the new rep claim lines the old rep had already been paid: the claim index and the
--    "already on a statement" join were per employee. Now:
--      * the resolved rep and sale type are stamped onto crm_invoices when it leaves draft
--        (any path: app, crons, service role); issued invoices are backfilled, preferring
--        the rep whose statement already holds the invoice's lines;
--      * after issue, changing Sales Rep / Sale Type needs commission_manage, and is refused
--        while any of the invoice's commission is on a live statement;
--      * an earning line (ev_key) can be on one live statement only, whoever the rep.
-- 2. crm_commission_lines filtered events to the period, and create_statement only claimed
--    in-period lines, so anything dated in a period that already had a statement (a check
--    entered late, a deposit applied later, a draft issued after close, a line added to a
--    paid invoice) was never paid — while clawbacks always landed. crm_commission_lines takes
--    p_include_earlier: unclaimed lines dated before p_from are returned too, and
--    create_statement always claims them ("from earlier periods" in the UI).
-- 3. Own-commission access (statements, lines, the earnings/clawback RPCs) now needs the
--    commission_view_own key and a live employee record; a rep sees their approved/paid
--    statements, not drafts the owner is still preparing.

-- ── 1a. claim once per earning line ──────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from public.crm_commission_statement_lines
    where is_active and source_ev_key is null
    group by org_id, ev_key having count(*) > 1
  ) then
    raise exception 'An earning line is already on two live statements (different reps). Void one of them before applying this migration.';
  end if;
end $$;

drop index if exists public.uq_crm_commission_line_claim;
create unique index if not exists uq_crm_commission_line_claim_once
  on public.crm_commission_statement_lines (org_id, ev_key)
  where is_active and source_ev_key is null;
-- Adjustment (clawback) lines are per rep: each rep's own shortfall on a line they were paid.
create unique index if not exists uq_crm_commission_adjustment_claim
  on public.crm_commission_statement_lines (org_id, employee_id, ev_key)
  where is_active and source_ev_key is not null;

-- ── 1b. resolved rep / sale type for an invoice ──────────────────────────────
-- Invoker: callers only resolve records they can already read (the stamping trigger
-- runs as definer; consolidate/merge run as the user).
create or replace function public.crm_invoice_resolve_rep(
  p_client_id uuid, p_job_id uuid, p_contract_id uuid, p_estimate_id uuid,
  out rep_id uuid, out sale_type text
)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(j.sales_rep_id, k.sales_rep_id, e.sales_rep_id, c.sales_rep_id),
         coalesce(j.sale_type, k.sale_type, e.sale_type, 'new')
  from (select 1) one
  left join public.crm_jobs j on j.id = p_job_id
  left join public.crm_contracts k on k.id = p_contract_id
  left join public.estimates e on e.id = p_estimate_id
  left join public.clients c on c.id = p_client_id;
$$;
revoke all on function public.crm_invoice_resolve_rep(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.crm_invoice_resolve_rep(uuid, uuid, uuid, uuid) to authenticated;

-- Whether an org pays commission at all (an active plan). Definer: plan rows are
-- commission_manage-only, but merge/consolidate need the answer for anyone allowed to
-- edit invoices. Returns only a boolean for the caller's own org.
create or replace function public.crm_org_uses_commissions()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.crm_commission_plans pl
    where pl.org_id = public.my_org_id() and pl.deleted_at is null and pl.is_active
  );
$$;
revoke all on function public.crm_org_uses_commissions() from public, anon;
grant execute on function public.crm_org_uses_commissions() to authenticated;

-- ── 1c. backfill issued invoices (before the trigger exists) ─────────────────
-- updated_at is left alone: the QuickBooks cron re-pushes invoices whose updated_at moved.
alter table public.crm_invoices disable trigger trg_crm_invoices_updated_at;

update public.crm_invoices i
   set sales_rep_id = coalesce(
         i.sales_rep_id,
         (select sl.employee_id
            from public.crm_commission_statement_lines sl
            join public.crm_commission_statements s on s.id = sl.statement_id and s.status <> 'void'
           where sl.invoice_id = i.id and sl.is_active and sl.source_ev_key is null
           order by sl.created_at limit 1),
         r.rep_id),
       sale_type = coalesce(i.sale_type, r.sale_type)
  from public.crm_invoices src
  cross join lateral public.crm_invoice_resolve_rep(src.client_id, src.crm_job_id, src.contract_id, src.estimate_id) r
 where src.id = i.id
   and i.deleted_at is null
   and i.status not in ('draft', 'void')
   and (i.sales_rep_id is null or i.sale_type is null);

alter table public.crm_invoices enable trigger trg_crm_invoices_updated_at;

-- ── 1d. stamp at issue + guard later edits ───────────────────────────────────
create or replace function public.crm_invoices_stamp_sales_rep()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep uuid;
  v_sale text;
begin
  -- An issued invoice's rep/sale type decide who earned it. A person (not a trigger
  -- cascade or a service-role job) changing them needs commission_manage, and can't
  -- once any of the invoice's commission is on a live statement.
  if tg_op = 'UPDATE'
     and old.status not in ('draft', 'void')
     and (new.sales_rep_id is distinct from old.sales_rep_id or new.sale_type is distinct from old.sale_type)
     and auth.uid() is not null
     and pg_trigger_depth() <= 1 then
    if not public.has_settings_permission('commission_manage') then
      raise exception 'The sales rep and sale type are locked once an invoice is issued. Only someone who manages commissions can change them.'
        using errcode = '42501';
    end if;
    if exists (
      select 1 from public.crm_commission_statement_lines sl
      join public.crm_commission_statements s on s.id = sl.statement_id and s.status <> 'void'
      where sl.invoice_id = new.id and sl.is_active and sl.source_ev_key is null
    ) then
      raise exception 'Commission on this invoice is already on a statement. Void that statement first, then change the sales rep or sale type.'
        using errcode = 'P0001';
    end if;
  end if;

  if new.status not in ('draft', 'void') and (new.sales_rep_id is null or new.sale_type is null) then
    select r.rep_id, r.sale_type into v_rep, v_sale
    from public.crm_invoice_resolve_rep(new.client_id, new.crm_job_id, new.contract_id, new.estimate_id) r;
    new.sales_rep_id := coalesce(new.sales_rep_id, v_rep);
    new.sale_type := coalesce(new.sale_type, v_sale);
  end if;
  return new;
end;
$$;
revoke all on function public.crm_invoices_stamp_sales_rep() from public, anon, authenticated;

drop trigger if exists trg_crm_invoices_stamp_sales_rep on public.crm_invoices;
create trigger trg_crm_invoices_stamp_sales_rep
  before insert or update of status, sales_rep_id, sale_type on public.crm_invoices
  for each row execute function public.crm_invoices_stamp_sales_rep();

-- ── 2. earnings: claim-once join, earlier unclaimed lines, view-own key ──────
drop function if exists public.crm_commission_lines(date, date, uuid);

create or replace function public.crm_commission_lines(
  p_from date, p_to date, p_employee_id uuid default null, p_include_earlier boolean default false
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
  select id into v_me from crm_employees
   where user_id = auth.uid() and org_id = v_org and deleted_at is null limit 1;
  if not (public.has_settings_permission('commission_view')
          or public.has_settings_permission('commission_manage')
          or (p_employee_id is not null and p_employee_id = v_me
              and public.has_settings_permission('commission_view_own'))) then
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
    where p.payment_date <= p_to and (p_include_earlier or p.payment_date >= p_from)
    union all
    select 'inv:' || inv.id::text || ':' || ln.line_id::text, 'invoiced', inv.invoice_date,
           round((inv.total_cents - inv.tax_cents)::numeric * ln.net / ln.net_sum)::int,
           inv.id, inv.invoice_number, inv.client_id, inv.client_name, inv.rep_id, inv.sale_type,
           ln.service_id, ln.service_name, ln.category
    from inv
    join ln on ln.invoice_id = inv.id and ln.net_sum > 0
    where inv.invoice_date <= p_to and (p_include_earlier or inv.invoice_date >= p_from)
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
  -- Claimed by ANY rep: an earning line is paid once.
  left join crm_commission_statement_lines sl
    on sl.org_id = v_org and sl.ev_key = m.ev_key and sl.is_active and sl.source_ev_key is null
  -- Earlier-period rows only while nobody has claimed them.
  where m.event_date >= p_from or sl.statement_id is null
  order by m.employee_name, m.event_date, m.invoice_number;
end;
$$;

revoke all on function public.crm_commission_lines(date, date, uuid, boolean) from public, anon;
grant execute on function public.crm_commission_lines(date, date, uuid, boolean) to authenticated;

-- Body is 20261101000200 with the view-own key and a live, same-org employee record.
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
  select id into v_me from crm_employees
   where user_id = auth.uid() and org_id = v_org and deleted_at is null limit 1;
  if not (public.has_settings_permission('commission_view')
          or public.has_settings_permission('commission_manage')
          or (p_employee_id is not null and p_employee_id = v_me
              and public.has_settings_permission('commission_view_own'))) then
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

-- Body is 20261107000100 (org-day adjustments) with earlier unclaimed lines included.
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
  from public.crm_commission_lines(p_from, p_to, p_employee_id, true)
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
  from public.crm_commission_lines(p_from, p_to, p_employee_id, true) l
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

-- ── 3. own statements: key + live employee + issued statements only ──────────
drop policy if exists crm_commission_stmt_select on public.crm_commission_statements;
create policy crm_commission_stmt_select on public.crm_commission_statements for select
  using (org_id = my_org_id() and (
    has_settings_permission('commission_view') or has_settings_permission('commission_manage')
    or (has_settings_permission('commission_view_own')
        and status in ('approved', 'paid')
        and employee_id in (select id from crm_employees
                             where user_id = auth.uid() and org_id = my_org_id() and deleted_at is null))));

drop policy if exists crm_commission_lines_select on public.crm_commission_statement_lines;
create policy crm_commission_lines_select on public.crm_commission_statement_lines for select
  using (org_id = my_org_id() and (
    has_settings_permission('commission_view') or has_settings_permission('commission_manage')
    or (has_settings_permission('commission_view_own')
        and employee_id in (select id from crm_employees
                             where user_id = auth.uid() and org_id = my_org_id() and deleted_at is null)
        and statement_id in (select s.id from crm_commission_statements s
                              where s.org_id = my_org_id() and s.status in ('approved', 'paid')))));
