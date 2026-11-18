-- Crew-login lockdown, part 1 of 2 (bug sweep round 15, area 2).
--
-- Crew logins (profiles.role = 'crew', one shared login per crew) could read and
-- write far more than the crew app uses. This part holds every change that is
-- safe with the CURRENT app code still deployed; part 2 (20270109000210) holds
-- the read/write blocks that need the new crew code first.
--
--   1. product_items: crew could INSERT / UPDATE / soft-delete catalog rows
--      (price, unit_cost, quantity_on_hand). org_members_product_items is ALL on
--      org and role_write_guard_* only stops viewer/requestor. Crew stock use
--      goes through definer RPCs (set_job_product_status ->
--      adjust_product_item_quantity, crew_set_job_product_qty, receive_*), which
--      run as the owner and are unaffected.
--   2. crm_sales_meetings: "org members manage sales meetings" is ALL org-only, so
--      crew could read and edit every sales meeting. The crew app never touches
--      the table: crew is blocked entirely.
--   3. crm_crew_member_times: crew could read every punch in the org. Now its own
--      crew's members (same rule as the write policies: crew_day_member_is_mine)
--      plus punches on visits the crew can already see.
--   4. crm_employees: crew could read HR fields (date_hired, date_released,
--      employment_status, vacation/sick days, insurance, compensation type) for
--      every employee. Column grants are shared with office users (one
--      `authenticated` role), so the block is by row: a crew login sees only an
--      employee row linked to itself (normally none — crew logins have no
--      employee record). The crew app reads people through crm_crew_members
--      (name/role) and definer RPCs; chemical applicator licences are read with
--      the service role.
--   5. profiles: crew could read every user's email and role. Crew now sees only
--      its own profile row, which is all the crew app reads.
--   6. crm_crew_job_visits (crew visit view): rate_cents is NULL for a crew login
--      when the org has "Hide pricing from crews" on (same rule as
--      crm_crew_job_services). The view also had INSERT/UPDATE/DELETE/TRUNCATE
--      granted to authenticated — revoked (reads only).
--   7. Two definer reads for the crew app, used by the new code instead of the
--      catalog tables (which part 2 hides from crew):
--        crm_crew_product_info(uuid[]) — product name / part number / chemical
--          safety fields, never cost, price, stock or cost layers.
--        crm_crew_upsell_services() — the "Suggest work" list (id, name, pitch).
--
-- PROD: apply BEFORE the code deploy. Nothing here breaks the current app.
-- PRE-CHECK (informational): select count(*) from profiles where role = 'crew';
-- RLS only: no data changes.

-- ── 1. product_items: no crew writes ─────────────────────────────────────────
drop policy if exists crew_no_write_product_items_ins on public.product_items;
create policy crew_no_write_product_items_ins on public.product_items
  as restrictive for insert to public
  with check (coalesce((select public.my_role()), '') <> 'crew');

drop policy if exists crew_no_write_product_items_upd on public.product_items;
create policy crew_no_write_product_items_upd on public.product_items
  as restrictive for update to public
  using (coalesce((select public.my_role()), '') <> 'crew')
  with check (coalesce((select public.my_role()), '') <> 'crew');

drop policy if exists crew_no_write_product_items_del on public.product_items;
create policy crew_no_write_product_items_del on public.product_items
  as restrictive for delete to public
  using (coalesce((select public.my_role()), '') <> 'crew');

-- ── 2. crm_sales_meetings: no crew access at all ─────────────────────────────
drop policy if exists crew_no_access_sales_meetings on public.crm_sales_meetings;
create policy crew_no_access_sales_meetings on public.crm_sales_meetings
  as restrictive for all to public
  using (coalesce((select public.my_role()), '') <> 'crew')
  with check (coalesce((select public.my_role()), '') <> 'crew');

-- ── 3. crm_crew_member_times: crew reads its own crew's punches ──────────────
drop policy if exists crew_role_own_crew_select on public.crm_crew_member_times;
create policy crew_role_own_crew_select on public.crm_crew_member_times
  as restrictive for select to public
  using (
    coalesce((select public.my_role()), '') <> 'crew'
    or public.crew_day_member_is_mine(
         crew_member_id,
         (coalesce(clocked_in_at, now()) at time zone public.org_timezone(org_id))::date)
    -- Punches on a visit the crew can see (crm_job_visits RLS: its own crew's visits).
    or exists (select 1 from public.crm_job_visits v where v.id = crm_crew_member_times.visit_id)
  );

-- ── 4. crm_employees: crew sees only an employee row linked to itself ────────
drop policy if exists crew_no_read_employees on public.crm_employees;
create policy crew_no_read_employees on public.crm_employees
  as restrictive for select to public
  using (
    coalesce((select public.my_role()), '') <> 'crew'
    or user_id = (select auth.uid())
  );

-- ── 5. profiles: crew sees only its own row ──────────────────────────────────
drop policy if exists crew_reads_own_profile_only on public.profiles;
create policy crew_reads_own_profile_only on public.profiles
  as restrictive for select to public
  using (
    coalesce((select public.my_role()), '') <> 'crew'
    or id = (select auth.uid())
  );

-- ── 6. crm_crew_job_visits: visit rate hidden from crew when pricing is hidden ─
-- Same columns, names and types as 20270108000100 (create or replace keeps the
-- crew_job(crm_crew_job_visits) dependency); only rate_cents becomes an expression.
create or replace view public.crm_crew_job_visits
with (security_invoker = true) as
select
  v.id, v.org_id, v.job_id, v.client_id, v.crew_id, v.scheduled_date, v.start_time, v.end_time,
  v.status, v.completion_notes, v.actual_hours, v.completed_at, v.priority, v.notes_to_crew,
  v.created_at, v.updated_at, v.deleted_at, v.created_by, v.sub_status, v.order_num, v.men_count,
  v.qty,
  case
    when coalesce((select public.my_role()), '') <> 'crew'
      or not coalesce((select o.crew_hide_pricing from public.organizations o where o.id = v.org_id), false)
    then v.rate_cents
  end as rate_cents,
  v.notes_to_client, v.invoice_description, v.job_comments,
  v.assigned_employee_id, v.dispatched_at, v.clocked_in_at, v.clocked_out_at,
  v.acknowledged_notes_at, v.skip_reason, v.budgeted_hours, v.storm_event_id,
  v.snow_depth_inches, v.temperature, v.asset_type, v.materials_used, v.job_service_id,
  v.paused_at, v.break_minutes, v.is_high_priority, v.notes_to_crew_updated_at,
  v.occurrence_date, v.crew_unassigned, v.break_paid, v.chemical_confirmation_waived_at,
  v.chemical_confirmation_waived_by, v.crew_group_id, v.crew_group_secondary, v.push_number,
  v.bill_push, v.handed_off_from_crew_id
from public.crm_job_visits v;

comment on view public.crm_crew_job_visits is
  'crm_job_visits without actual_labor_cost_cents, for crew surfaces and the crew_job() computed relationship (whose whole-row argument must not include an ungranted column). Follows crm_job_visits RLS. rate_cents is NULL for a crew login when organizations.crew_hide_pricing is on. Read-only. See 20270108000100, 20270109000200.';

revoke all on public.crm_crew_job_visits from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.crm_crew_job_visits from authenticated;
grant select on public.crm_crew_job_visits to authenticated, service_role;

-- ── 7. definer reads for the crew app ────────────────────────────────────────
-- Product details a crew screen shows (chemical mix card, material names). Never
-- unit_cost / price / cost_layers / quantity_on_hand / vendor. Deleted products are
-- included on purpose: an application recorded before the product was retired still
-- needs its name and label. Scoped to the caller's org; NULL org returns nothing.
create or replace function public.crm_crew_product_info(p_product_ids uuid[])
returns table (
  id uuid,
  name text,
  part_number text,
  category text,
  track_chemicals boolean,
  epa_registration_number text,
  re_entry_interval text,
  label_instructions text,
  restricted_product boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.part_number, p.category, p.track_chemicals,
         p.epa_registration_number, p.re_entry_interval, p.label_instructions,
         p.restricted_product
  from public.product_items p
  where p.id = any (coalesce(p_product_ids, '{}'::uuid[]))
    and p.org_id = (select public.my_org_id())
    and (select public.has_crm_access());
$$;

revoke all on function public.crm_crew_product_info(uuid[]) from public, anon;
grant execute on function public.crm_crew_product_info(uuid[]) to authenticated, service_role;

-- The services the office opened up for crews to suggest ("Suggest work").
-- Name and pitch only: no rate, cost or target rate.
create or replace function public.crm_crew_upsell_services()
returns table (id uuid, name text, upsell_pitch text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.upsell_pitch
  from public.crm_services s
  where s.org_id = (select public.my_org_id())
    and (select public.has_crm_access())
    and s.show_in_field_upsells
    and s.is_active
    and s.deleted_at is null
  order by s.name;
$$;

revoke all on function public.crm_crew_upsell_services() from public, anon;
grant execute on function public.crm_crew_upsell_services() to authenticated, service_role;
