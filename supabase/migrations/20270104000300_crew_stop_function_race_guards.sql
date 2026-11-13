-- Race guards on the multi-crew / crew-app stop functions (from the 2026-11-12 review).
--
--  * crm_crew_hand_off_stop checked status / clocked_in_at and then updated with no
--    lock and no condition, so a clock-in landing in between had the stop flipped
--    back to dispatched and moved to the other crew mid-job. It now locks the visit
--    (FOR UPDATE) and the update itself re-checks the stop has not started.
--  * crm_add_visit_crew and crm_crew_request_help read the lead without a lock and
--    each minted its own crew_group_id for a group-less lead, so two simultaneous
--    calls left a secondary visit in a group with no lead. The lead (and the picked
--    visit) are now locked, so the second call waits and sees the first one's group.
--  * crm_crew_request_help accepted a deactivated crew as the helper (hand-off
--    already refused one); the work would land on a tablet nobody uses.
-- Bodies are otherwise identical to 20270101001410 / 1430 / 1440.

CREATE OR REPLACE FUNCTION public.crm_add_visit_crew(p_visit_id uuid, p_crew_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid := my_org_id();
  v_pick    crm_job_visits%rowtype;
  v_lead    crm_job_visits%rowtype;
  v_job     crm_jobs%rowtype;
  v_gid     uuid;
  v_eff     uuid;
  v_new     uuid := gen_random_uuid();
begin
  if v_org is null then
    raise exception 'crm_add_visit_crew: no org for current user';
  end if;

  select * into v_pick from crm_job_visits
   where id = p_visit_id and org_id = v_org and deleted_at is null
   for update;
  if not found then
    raise exception 'Visit not found';
  end if;

  -- Always clone from the group's lead.
  if v_pick.crew_group_id is not null then
    select * into v_lead from crm_job_visits
     where crew_group_id = v_pick.crew_group_id and not crew_group_secondary and deleted_at is null
     limit 1
     for update;
  end if;
  if not found or v_lead.id is null then
    v_lead := v_pick;
  end if;

  select * into v_job from crm_jobs where id = v_lead.job_id and org_id = v_org and deleted_at is null;
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

  v_eff := case when v_lead.crew_unassigned then null else coalesce(v_lead.crew_id, v_job.crew_id) end;
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

CREATE OR REPLACE FUNCTION public.crm_crew_request_help(p_visit_id uuid, p_crew_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid := my_org_id();
  v_pick    crm_job_visits%rowtype;
  v_lead    crm_job_visits%rowtype;
  v_job     crm_jobs%rowtype;
  v_gid     uuid;
  v_eff     uuid;
  v_new     uuid := gen_random_uuid();
  v_me      uuid;
begin
  if v_org is null then
    raise exception 'crm_crew_request_help: no org for current user';
  end if;

  -- Only a crew login (crm_crews.user_id) can ask for help, and only on a stop its own crew is on.
  select id into v_me from crm_crews
   where user_id = auth.uid() and org_id = v_org and deleted_at is null and is_active
   order by created_at limit 1;
  if v_me is null then
    raise exception 'Only a crew login can ask another crew for help.';
  end if;

  select * into v_pick from crm_job_visits
   where id = p_visit_id and org_id = v_org and deleted_at is null
   for update;
  if not found then
    raise exception 'Visit not found';
  end if;

  -- Always clone from the group's lead.
  if v_pick.crew_group_id is not null then
    select * into v_lead from crm_job_visits
     where crew_group_id = v_pick.crew_group_id and not crew_group_secondary and deleted_at is null
     limit 1
     for update;
  end if;
  if not found or v_lead.id is null then
    v_lead := v_pick;
  end if;

  select * into v_job from crm_jobs where id = v_lead.job_id and org_id = v_org and deleted_at is null;
  if not found then
    raise exception 'Job not found';
  end if;
  if v_job.job_type <> 'snow' then
    raise exception 'Calling in another crew from the crew app is only available on snow stops for now.';
  end if;
  if v_lead.status not in ('scheduled', 'dispatched', 'in_progress') then
    raise exception 'This stop is already finished — another crew can no longer be added.';
  end if;
  -- The caller's crew must be ON this stop: the lead's crew or one already in its group.
  if v_me is distinct from (case when v_lead.crew_unassigned then null else coalesce(v_lead.crew_id, v_job.crew_id) end)
     and not exists (
       select 1 from crm_job_visits g
        where g.crew_group_id is not null and g.crew_group_id = v_lead.crew_group_id
          and g.crew_id = v_me and g.deleted_at is null
     ) then
    raise exception 'Your crew is not on this stop.';
  end if;

  perform 1 from crm_crews where id = p_crew_id and org_id = v_org and deleted_at is null and is_active;
  if not found then
    raise exception 'Crew not found';
  end if;

  v_eff := case when v_lead.crew_unassigned then null else coalesce(v_lead.crew_id, v_job.crew_id) end;
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
      -- Straight to the helping crew's tablet: dispatched, with no clock-in of its own.
      'status', 'dispatched',
      'dispatched_at', now(),
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

create or replace function public.crm_crew_hand_off_stop(p_visit_id uuid, p_crew_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org   uuid := my_org_id();
  v_me    uuid;
  v_visit crm_job_visits%rowtype;
  v_job   crm_jobs%rowtype;
begin
  if v_org is null then
    raise exception 'crm_crew_hand_off_stop: no org for current user';
  end if;

  select id into v_me from crm_crews
   where user_id = auth.uid() and org_id = v_org and deleted_at is null and is_active
   order by created_at limit 1;
  if v_me is null then
    raise exception 'Only a crew login can hand off a stop.';
  end if;

  select * into v_visit from crm_job_visits
   where id = p_visit_id and org_id = v_org and deleted_at is null
   for update;
  if not found then
    raise exception 'Visit not found';
  end if;
  select * into v_job from crm_jobs where id = v_visit.job_id and org_id = v_org and deleted_at is null;
  if not found then
    raise exception 'Job not found';
  end if;

  if v_job.job_type <> 'snow' then
    raise exception 'Handing off a stop from the crew app is only available on snow stops for now.';
  end if;
  if v_me is distinct from (case when v_visit.crew_unassigned then null else coalesce(v_visit.crew_id, v_job.crew_id) end) then
    raise exception 'Your crew is not on this stop.';
  end if;
  if v_visit.crew_group_id is not null then
    raise exception 'This stop has more than one crew — call the office to move it.';
  end if;
  if v_visit.status not in ('scheduled', 'dispatched') or v_visit.clocked_in_at is not null then
    raise exception 'Your crew has already started this stop — use Need help instead.';
  end if;

  if p_crew_id = v_me then
    raise exception 'Pick a different crew.';
  end if;
  perform 1 from crm_crews
   where id = p_crew_id and org_id = v_org and deleted_at is null and is_active;
  if not found then
    raise exception 'Crew not found';
  end if;

  update crm_job_visits
     set crew_id = p_crew_id,
         crew_unassigned = false,
         status = 'dispatched',
         dispatched_at = now(),
         handed_off_from_crew_id = v_me,
         updated_at = now()
   where id = p_visit_id
     and status in ('scheduled', 'dispatched')
     and clocked_in_at is null;
  if not found then
    raise exception 'Your crew has already started this stop — use Need help instead.';
  end if;

  return p_visit_id;
end;
$function$;
