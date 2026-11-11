-- Crew logins: price-free read path for jobs + job services (part 1 of 2).
--
-- Residual from 20260910160000_crew_write_lockdown.sql: a crew login
-- (profiles.role = 'crew', a shared field-tablet account) holds a valid JWT
-- and the anon key, so a hand-built PostgREST query could READ every job's
-- rate and totals (crm_jobs), every job service's rate (crm_job_services) and
-- every job material's price and cost (crm_job_products) for the whole org.
-- Measured on TEST as a crew login: 30 of 31 jobs and 50 of 52 job services
-- with a non-zero price, plus job-material prices/costs.
--
-- Row-level security can't hide columns, and column privileges can't tell a
-- crew login from an office login (both are the `authenticated` Postgres
-- role). So the fix is in two parts:
--
--   part 1 (this file, safe to apply before the app deploys):
--     * crm_crew_jobs / crm_crew_job_services — security_invoker views that
--       only define the price-free SHAPE the crew app reads (no rate/total/
--       cost columns; the service rate only when the org lets crews see it).
--       Queried directly they follow the base tables' RLS like any view.
--     * crew_job(crm_job_visits) / crew_job_services(crm_crew_jobs) —
--       SECURITY DEFINER PostgREST computed relationships returning those
--       shapes, org-scoped and has_crm_access()-gated exactly like the base
--       tables' SELECT policies. The crew app embeds them under the old key:
--         crm_jobs:crew_job(..., crm_job_services:crew_job_services(...))
--       so every row keeps the shape the code already reads.
--       (Definer FUNCTIONS rather than definer VIEWS: a definer view is a
--       security-advisor ERROR, and the advisor baseline has none.)
--     * crm_job_crew_id(job_id) — definer lookup the crew RLS policies use
--       once crew can no longer read crm_jobs (part 2).
--     * crew_set_job_product_qty() — the crew "record materials used" write,
--       replacing the crew UPDATE policy on crm_job_products (part 2 drops it;
--       a crew can't UPDATE a row it can't SELECT). Runs as the caller's JWT,
--       so the audit trail still names the crew.
--     * crm_job_visits_push_number_guard() becomes SECURITY DEFINER: it reads
--       crm_jobs.invoice_type during a crew's clock-in on a 2nd snow push, and
--       would otherwise see no job once crew can't read crm_jobs.
--     * a guard so a crew login can't change a visit's price or quantity
--       (the "crew updates own crew visits" policy allowed any column — a
--       crew could PATCH its own visit's billed rate_cents).
--
--   part 2 (20261231000340, apply AFTER the app deploys): RESTRICTIVE
--   "crew_no_select" on crm_jobs / crm_job_services / crm_job_products, and
--   the crew policies that read crm_jobs switched to crm_job_crew_id().
--
-- crew_hide_pricing: with the setting OFF the crew stop page shows each
-- service's price, so crew_job_services returns rate_cents for crew logins
-- only when the org's crew_hide_pricing is false. Job-level rates and totals,
-- and material prices/costs, are never returned to crew.
--
-- Non-crew logins are unaffected: they keep reading the base tables, and the
-- new functions return the same rows (and the service rate) for them.

-- ── shapes ───────────────────────────────────────────────────────────────────
create or replace view public.crm_crew_jobs
with (security_invoker = true) as
select
  j.id, j.org_id, j.client_id, j.property_id, j.project_id, j.contract_id, j.package_id,
  j.job_number, j.job_type, j.status, j.sub_status,
  j.scheduled_date, j.start_time, j.end_time,
  j.waiting_list_start, j.waiting_list_end,
  j.recurrence_rule, j.recurrence_start, j.recurrence_end,
  j.package_name, j.package_step, j.package_total_steps,
  j.crew_id, j.man_count, j.budgeted_hours, j.actual_hours,
  j.service_address, j.service_city, j.service_state, j.service_zip, j.map_code, j.lat, j.lng,
  j.last_service_date, j.notes_to_crew, j.notes_to_crew_updated_at, j.completion_notes,
  j.priority, j.is_high_priority, j.schedule, j.schedule_days, j.asset_type, j.inch_trigger,
  j.call_ahead, j.arrival_window_hours, j.start_date_window, j.end_date_window, j.is_complete,
  j.created_at, j.updated_at, j.deleted_at
from public.crm_jobs j;

comment on view public.crm_crew_jobs is
  'Price-free shape of crm_jobs for the crew app (no rates, totals, labor/material cost, internal notes or billing fields). Read through the crew_job() computed relationship; see 20261231000330.';

create or replace view public.crm_crew_job_services
with (security_invoker = true) as
select
  s.id, s.org_id, s.job_id, s.service_id, s.service_name, s.qty,
  -- The service price, only where the crew may see it (crew_hide_pricing off).
  case
    when coalesce((select public.my_role()), '') <> 'crew'
      or not coalesce((select o.crew_hide_pricing from public.organizations o where o.id = s.org_id), false)
    then s.rate_cents
  end as rate_cents,
  s.start_date, s.complete_by_date, s.start_recurring, s.assigned_to,
  s.budgeted_hours, s.team_size, s.days_count, s.time_start, s.time_end,
  s.included, s.sort_order, s.min_days, s.max_visits, s.treated_area, s.job_note,
  s.created_at
from public.crm_job_services s;

comment on view public.crm_crew_job_services is
  'Shape of crm_job_services for the crew app: no internal note/invoice fields, and rate_cents only when the caller is not a crew login or the org has crew_hide_pricing off. Read through crew_job_services(); see 20261231000330.';

revoke all on public.crm_crew_jobs, public.crm_crew_job_services from public, anon;
grant select on public.crm_crew_jobs, public.crm_crew_job_services to authenticated, service_role;

-- ── computed relationships ──────────────────────────────────────────────────
-- Same row scope as the base tables' SELECT policies (org + has_crm_access()),
-- plus the service role (server routes pass a service client to shared crew
-- helpers). RLS on the base tables is bypassed (definer), which is the point:
-- crew can't read the base rows after part 2, only these columns.
create or replace function public.crew_job(public.crm_job_visits)
returns setof public.crm_crew_jobs
language sql
stable
security definer
set search_path = public
rows 1
as $$
  select c.*
  from public.crm_crew_jobs c
  where c.id = $1.job_id
    and (
      (select auth.role()) = 'service_role'
      or (c.org_id = (select public.my_org_id()) and (select public.has_crm_access()))
    );
$$;

create or replace function public.crew_job_services(public.crm_crew_jobs)
returns setof public.crm_crew_job_services
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.crm_crew_job_services s
  where s.job_id = $1.id
    and (
      (select auth.role()) = 'service_role'
      or (s.org_id = (select public.my_org_id()) and (select public.has_crm_access()))
    );
$$;

revoke all on function public.crew_job(public.crm_job_visits) from public, anon;
revoke all on function public.crew_job_services(public.crm_crew_jobs) from public, anon;
grant execute on function public.crew_job(public.crm_job_visits) to authenticated, service_role;
grant execute on function public.crew_job_services(public.crm_crew_jobs) to authenticated, service_role;

-- ── job crew lookup for RLS ─────────────────────────────────────────────────
-- The crew visit/client policies resolve a visit's EFFECTIVE crew through its
-- job (visit.crew_id is usually null). They read crm_jobs under the caller's
-- RLS today; after part 2 a crew can't, so they call this instead.
create or replace function public.crm_job_crew_id(p_job_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select j.crew_id
  from public.crm_jobs j
  where j.id = p_job_id
    and j.org_id = (select public.my_org_id());
$$;

revoke all on function public.crm_job_crew_id(uuid) from public, anon;
grant execute on function public.crm_job_crew_id(uuid) to authenticated, service_role;

-- ── crew "record materials used" qty write ──────────────────────────────────
-- Same scope as the crew UPDATE policy it replaces ("crew updates own crew job
-- products": a pending row on a job with a live visit of the caller's crew)
-- plus the table's restrictive guards (has_crm_access, org not read-only).
-- Only qty, and only while the row is still pending (the route's race guard).
create or replace function public.crew_set_job_product_qty(p_job_product_id uuid, p_qty numeric)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if p_qty is null or p_qty < 0 then
    raise exception 'Quantity must be zero or more.' using errcode = 'check_violation';
  end if;
  if not coalesce((select public.has_crm_access()), false)
     or (select public.my_org_is_read_only()) is true then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  update public.crm_job_products jp
     set qty = p_qty
   where jp.id = p_job_product_id
     and jp.org_id = (select public.my_org_id())
     and jp.deleted_at is null
     and jp.status = 'pending'
     and exists (
       select 1
       from public.crm_job_visits v
       join public.crm_jobs j on j.id = v.job_id
       where v.job_id = jp.job_id
         and v.deleted_at is null
         and (case when v.crew_unassigned then null else coalesce(v.crew_id, j.crew_id) end)
             in (select public.my_crew_ids())
     );
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.crew_set_job_product_qty(uuid, numeric) from public, anon;
grant execute on function public.crew_set_job_product_qty(uuid, numeric) to authenticated;

-- ── push-number guard reads crm_jobs: run as definer ────────────────────────
-- Body unchanged from 20261223000200_snow_pushes_and_contract_dates.sql.
create or replace function public.crm_job_visits_push_number_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_invoice_type text;
begin
  if coalesce(new.push_number, 1) <= 1 then
    return new;
  end if;
  if new.storm_event_id is null then
    raise exception 'Only a storm visit can be an additional push.'
      using errcode = 'check_violation';
  end if;
  select invoice_type into v_invoice_type from crm_jobs where id = new.job_id;
  if coalesce(v_invoice_type, '') <> 'per_push_per_inch' then
    raise exception 'Only Per Push snow jobs can have more than one push per storm.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

revoke all on function public.crm_job_visits_push_number_guard() from public, anon, authenticated;

-- ── a crew login can't change a visit's billed price/quantity ───────────────
-- No crew route writes these (they're the office's per-visit price override).
-- Only a statement the crew issued directly (trigger depth 1); writes made by
-- other triggers on the crew's behalf are untouched.
create or replace function public.crm_job_visits_crew_price_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if pg_trigger_depth() = 1
     and coalesce((select public.my_role()), '') = 'crew'
     and (new.rate_cents is distinct from old.rate_cents or new.qty is distinct from old.qty) then
    raise exception 'A crew login can''t change a visit''s price or quantity.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.crm_job_visits_crew_price_guard() from public, anon, authenticated;

drop trigger if exists a_crm_job_visits_crew_price_guard on public.crm_job_visits;
create trigger a_crm_job_visits_crew_price_guard
  before update of rate_cents, qty on public.crm_job_visits
  for each row execute function public.crm_job_visits_crew_price_guard();

notify pgrst, 'reload schema';
