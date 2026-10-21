-- Warranties (walls, walkways, patios, lawn renovations) and sales commissions.
--
-- Warranties: org-defined types with a default duration. A warranty belongs to
-- a client and optionally a project / job. A warranty attached to a project
-- before the work is done starts 'pending' (no dates) and its clock starts
-- when the project is marked complete. Expiry is derived from end_date, not
-- stored. damage_cases (warranty claims) can point at the warranty they claim
-- against.
--
-- Commissions: plans -> rules (rate per service / service category / sale type,
-- earned on payment or invoice) -> assignments (employee, effective-dated; a
-- rep can hold several plans at once). Earnings are computed live by
-- crm_commission_lines() from invoice LINES (each line belongs to a service) and
-- payment allocations; a statement freezes a period for an employee and claims
-- each earning line exactly once so nothing is paid twice.
--
-- Invoice lines now carry service_id (resolved by trigger when the writer does
-- not supply it) so revenue and commission land on the right service.

-- ── warranties ────────────────────────────────────────────────────────────────
create table if not exists public.crm_warranty_types (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null default my_org_id() references organizations(id),
  name                    text not null,
  default_duration_months integer not null default 12 check (default_duration_months > 0),
  default_coverage        text,
  sort_order              integer not null default 0,
  is_active               boolean not null default true,
  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid references auth.users(id)
);

create table if not exists public.crm_warranties (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null default my_org_id() references organizations(id),
  client_id             uuid not null references clients(id),
  project_id            uuid references projects(id) on delete set null,
  job_id                uuid references crm_jobs(id) on delete set null,
  warranty_type_id      uuid references crm_warranty_types(id) on delete set null,
  name                  text not null,
  coverage              text,
  duration_months       integer not null default 12 check (duration_months > 0),
  status                text not null default 'pending' check (status in ('pending','active','void')),
  start_date            date,
  end_date              date,
  damages_covered_cents integer check (damages_covered_cents is null or damages_covered_cents >= 0),
  notes                 text,
  void_reason           text,
  renewed_from_id       uuid references crm_warranties(id) on delete set null,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id),
  -- active warranties must have a window; pending ones must not
  constraint crm_warranties_dates_ck check (
    (status = 'active' and start_date is not null and end_date is not null and end_date >= start_date)
    or (status = 'pending' and start_date is null and end_date is null)
    or status = 'void'
  )
);

create index if not exists idx_crm_warranties_client  on crm_warranties (org_id, client_id) where deleted_at is null;
create index if not exists idx_crm_warranties_project on crm_warranties (project_id) where deleted_at is null;
create index if not exists idx_crm_warranties_job     on crm_warranties (job_id) where deleted_at is null;
create index if not exists idx_crm_warranties_end     on crm_warranties (org_id, end_date) where deleted_at is null and status = 'active';

alter table damage_cases add column if not exists warranty_id uuid references crm_warranties(id) on delete set null;
create index if not exists idx_damage_cases_warranty on damage_cases (warranty_id) where deleted_at is null;

-- Starting a project's clock: when a project flips to complete, every pending
-- warranty on it starts today (org calendar) and runs duration_months.
create or replace function public.fn_start_project_warranties()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.org_today(NEW.org_id);
begin
  if NEW.status = 'complete' and OLD.status is distinct from 'complete' then
    update crm_warranties
    set status = 'active',
        start_date = v_today,
        -- same convention as warrantyEndFromTerm(): the day before the anniversary
        end_date = (v_today + make_interval(months => duration_months))::date - 1
    where project_id = NEW.id and status = 'pending' and deleted_at is null;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_projects_start_warranties on public.projects;
create trigger trg_projects_start_warranties
  after update of status on public.projects
  for each row execute function public.fn_start_project_warranties();

-- ── commissions ───────────────────────────────────────────────────────────────
create table if not exists public.crm_commission_plans (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references organizations(id),
  name        text not null,
  description text,
  is_active   boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);

create table if not exists public.crm_commission_plan_rules (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null default my_org_id() references organizations(id),
  plan_id    uuid not null references crm_commission_plans(id) on delete cascade,
  -- Scope: a specific service beats a service category, which beats neither (all services).
  service_id uuid references crm_services(id),
  category   text,
  sale_type  text not null default 'any' check (sale_type in ('any','new','renewal')),
  earned_on  text not null default 'paid' check (earned_on in ('paid','invoiced')),
  rate_bps   integer not null check (rate_bps >= 0 and rate_bps <= 10000),
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  check (service_id is null or category is null)
);
create unique index if not exists uq_crm_commission_rule_scope
  on crm_commission_plan_rules (plan_id, coalesce(service_id::text, ''), coalesce(lower(category), ''), sale_type, earned_on)
  where deleted_at is null;

create table if not exists public.crm_commission_assignments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default my_org_id() references organizations(id),
  employee_id    uuid not null references crm_employees(id),
  plan_id        uuid not null references crm_commission_plans(id),
  effective_from date not null,
  effective_to   date,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  check (effective_to is null or effective_to >= effective_from)
);
create index if not exists idx_crm_commission_assign_emp on crm_commission_assignments (org_id, employee_id) where deleted_at is null;

create table if not exists public.crm_commission_statements (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null default my_org_id() references organizations(id),
  employee_id            uuid not null references crm_employees(id),
  period_start           date not null,
  period_end             date not null,
  status                 text not null default 'draft' check (status in ('draft','approved','paid','void')),
  total_basis_cents      integer not null default 0,
  total_commission_cents integer not null default 0,
  approved_at            timestamptz,
  paid_at                timestamptz,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references auth.users(id),
  check (period_end >= period_start)
);
create index if not exists idx_crm_commission_stmt_emp on crm_commission_statements (org_id, employee_id);

create table if not exists public.crm_commission_statement_lines (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default my_org_id() references organizations(id),
  statement_id     uuid not null references crm_commission_statements(id) on delete cascade,
  employee_id      uuid not null references crm_employees(id),
  ev_key           text not null,
  invoice_id       uuid references crm_invoices(id) on delete set null,
  invoice_number   integer,
  client_name      text,
  plan_name        text,
  service_name     text,
  category         text,
  sale_type        text,
  earned_on        text,
  event_date       date,
  basis_cents      integer not null,
  rate_bps         integer not null,
  commission_cents integer not null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
-- an earning line can be claimed by only one live statement
create unique index if not exists uq_crm_commission_line_claim
  on crm_commission_statement_lines (org_id, employee_id, ev_key) where is_active;

-- ── triggers ──────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['crm_warranty_types','crm_warranties','crm_commission_plans',
    'crm_commission_plan_rules','crm_commission_assignments','crm_commission_statements'] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$s for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ── RLS ───────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['crm_warranty_types','crm_warranties','crm_commission_plans',
    'crm_commission_plan_rules','crm_commission_assignments','crm_commission_statements',
    'crm_commission_statement_lines'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Warranties: any CRM user reads; warranty_manage writes.
create policy crm_warranty_types_select on crm_warranty_types for select
  using (org_id = my_org_id() and has_crm_access());
create policy crm_warranty_types_write on crm_warranty_types for all
  using (org_id = my_org_id() and has_settings_permission('warranty_manage'))
  with check (org_id = my_org_id() and has_settings_permission('warranty_manage'));

create policy crm_warranties_select on crm_warranties for select
  using (org_id = my_org_id() and has_crm_access());
create policy crm_warranties_write on crm_warranties for all
  using (org_id = my_org_id() and has_settings_permission('warranty_manage'))
  with check (org_id = my_org_id() and has_settings_permission('warranty_manage'));

-- Commission configuration and statements: commission_view reads, commission_manage writes.
create policy crm_commission_plans_select on crm_commission_plans for select
  using (org_id = my_org_id() and (has_settings_permission('commission_view') or has_settings_permission('commission_manage')));
create policy crm_commission_plans_write on crm_commission_plans for all
  using (org_id = my_org_id() and has_settings_permission('commission_manage'))
  with check (org_id = my_org_id() and has_settings_permission('commission_manage'));

create policy crm_commission_rules_select on crm_commission_plan_rules for select
  using (org_id = my_org_id() and (has_settings_permission('commission_view') or has_settings_permission('commission_manage')));
create policy crm_commission_rules_write on crm_commission_plan_rules for all
  using (org_id = my_org_id() and has_settings_permission('commission_manage'))
  with check (org_id = my_org_id() and has_settings_permission('commission_manage'));

create policy crm_commission_assign_select on crm_commission_assignments for select
  using (org_id = my_org_id() and (has_settings_permission('commission_view') or has_settings_permission('commission_manage')));
create policy crm_commission_assign_write on crm_commission_assignments for all
  using (org_id = my_org_id() and has_settings_permission('commission_manage'))
  with check (org_id = my_org_id() and has_settings_permission('commission_manage'));

-- Statements are created/voided through RPCs; direct writes are status edits only.
create policy crm_commission_stmt_select on crm_commission_statements for select
  using (org_id = my_org_id() and (has_settings_permission('commission_view') or has_settings_permission('commission_manage')
         or employee_id in (select id from crm_employees where user_id = auth.uid())));
create policy crm_commission_stmt_update on crm_commission_statements for update
  using (org_id = my_org_id() and has_settings_permission('commission_manage'))
  with check (org_id = my_org_id() and has_settings_permission('commission_manage'));

create policy crm_commission_lines_select on crm_commission_statement_lines for select
  using (org_id = my_org_id() and (has_settings_permission('commission_view') or has_settings_permission('commission_manage')
         or employee_id in (select id from crm_employees where user_id = auth.uid())));

-- ── invoice lines belong to a service ─────────────────────────────────────────
alter table public.crm_invoice_line_items
  add column if not exists service_id uuid references public.crm_services(id) on delete set null;
create index if not exists idx_crm_invoice_lines_service on public.crm_invoice_line_items (service_id);

-- Best-effort service for a line whose writer did not name one, in order of
-- certainty: the visit's service, an exact catalog-name match, the invoice's
-- job (when it has exactly one service), then the estimate / contract's
-- largest service line.
create or replace function public.crm_resolve_invoice_line_service(
  p_org uuid, p_invoice_id uuid, p_visit_id uuid, p_label text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_svc uuid;
  v_job uuid; v_est uuid; v_con uuid;
begin
  if p_visit_id is not null then
    select js.service_id into v_svc
    from crm_job_visits v join crm_job_services js on js.id = v.job_service_id
    where v.id = p_visit_id;
    if v_svc is not null then return v_svc; end if;
  end if;

  if p_label is not null and btrim(p_label) <> '' then
    select s.id into v_svc from crm_services s
    where s.org_id = p_org and s.deleted_at is null and lower(s.name) = lower(btrim(p_label))
    order by s.is_active desc, s.created_at limit 1;
    if v_svc is not null then return v_svc; end if;
  end if;

  select crm_job_id, estimate_id, contract_id into v_job, v_est, v_con
  from crm_invoices where id = p_invoice_id;

  if v_job is not null then
    select (array_agg(distinct js.service_id))[1] into v_svc
    from crm_job_services js where js.job_id = v_job and js.service_id is not null
    having count(distinct js.service_id) = 1;
    if v_svc is not null then return v_svc; end if;
  end if;

  -- A contract names its service: the default service, else its only listed one.
  if v_con is not null then
    select s.id into v_svc
    from crm_contracts k
    join crm_services s on s.org_id = k.org_id and s.deleted_at is null
      and lower(s.name) = lower(btrim(coalesce(nullif(btrim(k.default_service), ''),
            case when jsonb_typeof(k.invoice_line_items) = 'array' and jsonb_array_length(k.invoice_line_items) = 1
                 then k.invoice_line_items ->> 0 end)))
    where k.id = v_con
    limit 1;
    if v_svc is not null then return v_svc; end if;
  end if;

  if v_est is null and v_con is not null then
    select estimate_id into v_est from crm_contracts where id = v_con;
  end if;
  if v_est is not null then
    select eli.service_id into v_svc from estimate_line_items eli
    where eli.estimate_id = v_est and eli.service_id is not null
    order by eli.total_cents desc limit 1;
    if v_svc is not null then return v_svc; end if;
  end if;

  if v_con is not null then
    select (array_agg(distinct js.service_id))[1] into v_svc
    from crm_jobs j join crm_job_services js on js.job_id = j.id
    where j.contract_id = v_con and js.service_id is not null
    having count(distinct js.service_id) = 1;
  end if;
  return v_svc;
end;
$$;
revoke all on function public.crm_resolve_invoice_line_service(uuid, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.fn_invoice_line_resolve_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.service_id is null then
    NEW.service_id := public.crm_resolve_invoice_line_service(
      NEW.org_id, NEW.invoice_id, NEW.visit_id, coalesce(NEW.name, NEW.description));
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_invoice_line_resolve_service on public.crm_invoice_line_items;
create trigger trg_invoice_line_resolve_service
  before insert on public.crm_invoice_line_items
  for each row execute function public.fn_invoice_line_resolve_service();

-- Backfill existing lines. Replica mode skips the lock/audit triggers: this is
-- bookkeeping on closed invoices, not an edit anyone should see in the audit trail.
set session_replication_role = replica;
update public.crm_invoice_line_items l
set service_id = public.crm_resolve_invoice_line_service(l.org_id, l.invoice_id, l.visit_id, coalesce(l.name, l.description))
where l.service_id is null;
reset session_replication_role;

-- ── sale type (new vs renewal) ────────────────────────────────────────────────
-- Set by the office, because only they know a one-time job for an existing
-- customer is still paid as a new sale. The invoice inherits the first of
-- invoice -> job -> contract -> estimate that has one; none means 'new'.
alter table public.estimates     add column if not exists sale_type text check (sale_type in ('new','renewal'));
alter table public.crm_jobs      add column if not exists sale_type text check (sale_type in ('new','renewal'));
alter table public.crm_contracts add column if not exists sale_type text check (sale_type in ('new','renewal'));
alter table public.crm_invoices  add column if not exists sale_type text check (sale_type in ('new','renewal'));

-- ── earnings engine ───────────────────────────────────────────────────────────
-- One row per commissionable event, per invoice LINE (so a rate can differ by
-- service):
--   earned_on='paid'     -> each payment allocation (event_date = payment date)
--   earned_on='invoiced' -> the invoice (event_date = invoice date)
-- A line's pre-tax revenue is its share of the invoice's pre-tax total
-- (net of line discounts, so invoice-level discounts are spread across lines).
-- The rep is the invoice's rep, falling back to its job, contract, estimate,
-- then the client's rep. When several of a rep's rules match, the most
-- specific wins (service > category > all; a sale type beats 'any'); on a tie
-- the higher rate. Allocations are net of refunds.
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

-- Freeze a period for one employee: claims every unclaimed line in range.
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
begin
  if v_org is null or not public.has_settings_permission('commission_manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to < p_from then raise exception 'period end is before start'; end if;
  if not exists (select 1 from crm_employees where id = p_employee_id and org_id = v_org) then
    raise exception 'employee not found';
  end if;

  -- Totals go in with the INSERT: the guard trigger freezes them afterwards.
  select count(*), coalesce(sum(basis_cents), 0), coalesce(sum(commission_cents), 0)
  into v_n, v_basis, v_comm
  from public.crm_commission_lines(p_from, p_to, p_employee_id)
  where statement_id is null;
  if v_n = 0 then
    raise exception 'no unclaimed commission lines in this period';
  end if;

  insert into crm_commission_statements
    (org_id, employee_id, period_start, period_end, total_basis_cents, total_commission_cents, created_by)
  values (v_org, p_employee_id, p_from, p_to, v_basis, v_comm, auth.uid())
  returning id into v_id;

  insert into crm_commission_statement_lines
    (org_id, statement_id, employee_id, ev_key, invoice_id, invoice_number, client_name, plan_name,
     service_name, category, sale_type, earned_on, event_date, basis_cents, rate_bps, commission_cents)
  select v_org, v_id, l.employee_id, l.ev_key, l.invoice_id, l.invoice_number, l.client_name, l.plan_name,
         l.service_name, l.category, l.sale_type, l.earned_on, l.event_date, l.basis_cents, l.rate_bps, l.commission_cents
  from public.crm_commission_lines(p_from, p_to, p_employee_id) l
  where l.statement_id is null;
  return v_id;
end;
$$;

create or replace function public.crm_commission_void_statement(p_statement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid := public.my_org_id();
begin
  if v_org is null or not public.has_settings_permission('commission_manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update crm_commission_statements set status = 'void'
  where id = p_statement_id and org_id = v_org and status in ('draft','approved');
  if not found then raise exception 'statement not found or already paid'; end if;
  update crm_commission_statement_lines set is_active = false where statement_id = p_statement_id;
end;
$$;

revoke all on function public.crm_commission_lines(date, date, uuid) from public, anon;
revoke all on function public.crm_commission_create_statement(uuid, date, date) from public, anon;
revoke all on function public.crm_commission_void_statement(uuid) from public, anon;
grant execute on function public.crm_commission_lines(date, date, uuid) to authenticated;
grant execute on function public.crm_commission_create_statement(uuid, date, date) to authenticated;
grant execute on function public.crm_commission_void_statement(uuid) to authenticated;

-- A statement's period/totals are frozen and its status only moves forward
-- (draft -> approved -> paid); voiding releases its lines.
create or replace function public.fn_commission_statement_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.employee_id is distinct from OLD.employee_id
     or NEW.period_start is distinct from OLD.period_start
     or NEW.period_end is distinct from OLD.period_end
     or NEW.total_basis_cents is distinct from OLD.total_basis_cents
     or NEW.total_commission_cents is distinct from OLD.total_commission_cents then
    raise exception 'commission statement period and totals are frozen';
  end if;
  if NEW.status is distinct from OLD.status then
    if OLD.status in ('paid','void') then
      raise exception 'a % statement cannot change status', OLD.status;
    end if;
    if NEW.status = 'void' then
      -- release the earning lines so they can be claimed by another statement
      update crm_commission_statement_lines set is_active = false where statement_id = NEW.id;
    end if;
    if OLD.status = 'approved' and NEW.status = 'draft' then
      raise exception 'an approved statement cannot go back to draft';
    end if;
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_commission_statement_guard on public.crm_commission_statements;
create trigger trg_commission_statement_guard
  before update on public.crm_commission_statements
  for each row execute function public.fn_commission_statement_guard();

-- ── permission keys for the seeded default roles (additive) ──────────────────
update public.crm_roles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
  'warranty_view', true, 'warranty_manage', true,
  'commission_view', true, 'commission_manage', true)
where deleted_at is null and name in ('Owner', 'Operations Manager');

update public.crm_roles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
  'warranty_view', true, 'warranty_manage', true)
where deleted_at is null and name in ('Office Admin', 'Sales / Account Mgr');
