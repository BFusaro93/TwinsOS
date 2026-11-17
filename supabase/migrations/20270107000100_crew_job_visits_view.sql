-- Labor cost columns, step 1 of 3: stop needing whole-row access to crm_job_visits.
--
-- APPLY BEFORE THE DEPLOY. Nothing here removes access; old and new app code
-- both keep working.
--
-- Goal (step 3, 20270107000300): revoke SELECT on crm_job_visits.
-- actual_labor_cost_cents and crm_jobs.actual_labor_cost_cents from end users.
-- For a one-person crew, visit labor cost ÷ hours = that person's pay rate.
--
-- Why this step exists: Postgres refuses a WHOLE-ROW reference to a table when
-- the caller lacks SELECT on any one of its columns. Two things made whole-row
-- references to crm_job_visits / crm_jobs as the caller:
--
--   * crew_job(crm_job_visits), the PostgREST computed relationship every crew
--     surface embeds as `crm_jobs:crew_job(...)` (20261231000330). PostgREST
--     calls it with the whole visit row, so the round 14 column revoke 403'd
--     the crew schedule. It now also hangs off crm_crew_job_visits, a
--     security_invoker view with every crm_job_visits column EXCEPT
--     actual_labor_cost_cents; the crew reads move to the view in this PR. The
--     crm_job_visits overload is dropped in step 3, after the deploy.
--   * crm_add_visit_crew / crm_remove_visit_crew (dispatch board "Add crew" /
--     "Remove crew") run as the caller and did `select * into <rowtype>` on
--     crm_job_visits and crm_jobs. They now read only the columns the caller
--     may read (crm_add_visit_crew still clones every readable column, so a
--     new visit column is copied without editing this function).
--
-- crm_crew_job_visits follows the base table's RLS (security_invoker), so a
-- crew sees exactly the visits it saw before. Its column list is frozen at
-- creation: add a new crm_job_visits column here too if a crew surface or a
-- crew_job embed needs it.

-- ── helper: the columns of a table the CALLER may select ────────────────────
create or replace function public._crm_readable_column_list(p_table regclass, p_alias text)
returns text
language sql
stable
set search_path = public, pg_catalog
as $$
  select string_agg(format('%I.%I', p_alias, a.attname), ', ' order by a.attnum)
  from pg_attribute a
  where a.attrelid = p_table
    and a.attnum > 0
    and not a.attisdropped
    and has_column_privilege(p_table, a.attnum, 'SELECT');
$$;

revoke all on function public._crm_readable_column_list(regclass, text) from public, anon;
grant execute on function public._crm_readable_column_list(regclass, text) to authenticated, service_role;

-- ── the crew visit shape ─────────────────────────────────────────────────────
create or replace view public.crm_crew_job_visits
with (security_invoker = true) as
select
  v.id, v.org_id, v.job_id, v.client_id, v.crew_id, v.scheduled_date, v.start_time, v.end_time,
  v.status, v.completion_notes, v.actual_hours, v.completed_at, v.priority, v.notes_to_crew,
  v.created_at, v.updated_at, v.deleted_at, v.created_by, v.sub_status, v.order_num, v.men_count,
  v.qty, v.rate_cents, v.notes_to_client, v.invoice_description, v.job_comments,
  v.assigned_employee_id, v.dispatched_at, v.clocked_in_at, v.clocked_out_at,
  v.acknowledged_notes_at, v.skip_reason, v.budgeted_hours, v.storm_event_id,
  v.snow_depth_inches, v.temperature, v.asset_type, v.materials_used, v.job_service_id,
  v.paused_at, v.break_minutes, v.is_high_priority, v.notes_to_crew_updated_at,
  v.occurrence_date, v.crew_unassigned, v.break_paid, v.chemical_confirmation_waived_at,
  v.chemical_confirmation_waived_by, v.crew_group_id, v.crew_group_secondary, v.push_number,
  v.bill_push, v.handed_off_from_crew_id
from public.crm_job_visits v;

comment on view public.crm_crew_job_visits is
  'crm_job_visits without actual_labor_cost_cents, for crew surfaces and the crew_job() computed relationship (whose whole-row argument must not include an ungranted column). Follows crm_job_visits RLS. See 20270107000100.';

revoke all on public.crm_crew_job_visits from public, anon;
grant select on public.crm_crew_job_visits to authenticated, service_role;

-- ── crew_job hangs off the view too ──────────────────────────────────────────
-- Same body and row scope as crew_job(crm_job_visits) (20261231000330).
create or replace function public.crew_job(public.crm_crew_job_visits)
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

revoke all on function public.crew_job(public.crm_crew_job_visits) from public, anon;
grant execute on function public.crew_job(public.crm_crew_job_visits) to authenticated, service_role;

-- ── crm_add_visit_crew: no whole-row reads ───────────────────────────────────
-- Body otherwise identical to 20270104000300: the pick and the lead are read
-- (and locked) through the caller's readable columns, then copied into a
-- crm_job_visits record; the job is read for its crew only.
CREATE OR REPLACE FUNCTION public.crm_add_visit_crew(p_visit_id uuid, p_crew_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_org      uuid := my_org_id();
  v_cols     text := public._crm_readable_column_list('public.crm_job_visits'::regclass, 'v');
  v_row      jsonb;
  v_pick     crm_job_visits%rowtype;
  v_lead     crm_job_visits%rowtype;
  v_job_crew uuid;
  v_gid      uuid;
  v_eff      uuid;
  v_new      uuid := gen_random_uuid();
begin
  if v_org is null then
    raise exception 'crm_add_visit_crew: no org for current user';
  end if;

  execute format(
    'select to_jsonb(x) from (select %s from public.crm_job_visits v
       where v.id = $1 and v.org_id = $2 and v.deleted_at is null
       for update) x', v_cols)
    into v_row using p_visit_id, v_org;
  if v_row is null then
    raise exception 'Visit not found';
  end if;
  v_pick := jsonb_populate_record(null::crm_job_visits, v_row);

  -- Always clone from the group's lead.
  v_row := null;
  if v_pick.crew_group_id is not null then
    execute format(
      'select to_jsonb(x) from (select %s from public.crm_job_visits v
         where v.crew_group_id = $1 and not v.crew_group_secondary and v.deleted_at is null
         limit 1
         for update) x', v_cols)
      into v_row using v_pick.crew_group_id;
  end if;
  if v_row is null then
    v_lead := v_pick;
  else
    v_lead := jsonb_populate_record(null::crm_job_visits, v_row);
  end if;

  select j.crew_id into v_job_crew
    from crm_jobs j
   where j.id = v_lead.job_id and j.org_id = v_org and j.deleted_at is null;
  if not found then
    raise exception 'Job not found';
  end if;
  if v_lead.status not in ('scheduled', 'dispatched') or v_lead.clocked_in_at is not null then
    raise exception 'Another crew can only be added before the stop has started.';
  end if;

  perform 1 from crm_crews where id = p_crew_id and org_id = v_org and deleted_at is null;
  if not found then
    raise exception 'Crew not found';
  end if;

  v_eff := case when v_lead.crew_unassigned then null else coalesce(v_lead.crew_id, v_job_crew) end;
  if v_eff is null then
    raise exception 'Assign a crew to this visit first, then add the second crew.';
  end if;

  v_gid := coalesce(v_lead.crew_group_id, gen_random_uuid());

  if v_eff = p_crew_id or exists (
    select 1 from crm_job_visits g
     where g.crew_group_id = v_gid and g.crew_id = p_crew_id and g.deleted_at is null
  ) then
    raise exception 'That crew is already on this stop.';
  end if;

  if v_lead.crew_group_id is null then
    update crm_job_visits
       set crew_group_id = v_gid,
           crew_id = v_eff,
           crew_unassigned = false
     where id = v_lead.id;
  end if;

  insert into crm_job_visits
  select (jsonb_populate_record(
    null::crm_job_visits,
    to_jsonb(v_lead) || jsonb_build_object(
      'id', v_new,
      'crew_id', p_crew_id,
      'crew_unassigned', false,
      'crew_group_id', v_gid,
      'crew_group_secondary', true,
      'status', v_lead.status,
      'dispatched_at', case when v_lead.status = 'dispatched' then v_lead.dispatched_at end,
      'completed_at', null,
      'clocked_in_at', null,
      'clocked_out_at', null,
      'paused_at', null,
      'break_minutes', 0,
      'break_paid', null,
      'actual_hours', null,
      'actual_labor_cost_cents', 0,
      'acknowledged_notes_at', null,
      'skip_reason', null,
      'sub_status', null,
      'completion_notes', null,
      'occurrence_date', null,
      'materials_used', '[]'::jsonb,
      'job_comments', '[]'::jsonb,
      'chemical_confirmation_waived_at', null,
      'chemical_confirmation_waived_by', null,
      'created_at', now(),
      'updated_at', now(),
      'created_by', auth.uid()
    )
  )).*;

  return v_new;
end;
$function$;

-- ── crm_remove_visit_crew: only the columns it uses ──────────────────────────
-- Body otherwise identical to 20261106000000.
create or replace function public.crm_remove_visit_crew(p_visit_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_org  uuid := my_org_id();
  v      record;
begin
  if v_org is null then
    raise exception 'crm_remove_visit_crew: no org for current user';
  end if;
  select id, crew_group_id, crew_group_secondary, status, clocked_in_at
    into v
    from crm_job_visits
   where id = p_visit_id and org_id = v_org and deleted_at is null;
  if not found or v.crew_group_id is null then
    raise exception 'This visit does not have multiple crews.';
  end if;
  if v.status not in ('scheduled', 'dispatched') or v.clocked_in_at is not null then
    raise exception 'That crew has already started — it can''t be removed from the stop.';
  end if;
  -- A completed sibling would inherit the lead role without ever running the
  -- auto-invoice step, leaving the stop unbilled.
  if not v.crew_group_secondary and exists (
    select 1 from crm_job_visits g
     where g.crew_group_id = v.crew_group_id and g.id <> v.id
       and g.deleted_at is null and g.status = 'completed'
  ) then
    raise exception 'The lead crew can''t be removed after another crew has completed its work on this stop — the stop would not be billed. Remove the other crew instead, or complete the lead visit.';
  end if;

  -- The failover trigger hands over the lead role and dissolves a group left
  -- with a single visit.
  update crm_job_visits set deleted_at = now() where id = v.id;
end;
$$;

notify pgrst, 'reload schema';
