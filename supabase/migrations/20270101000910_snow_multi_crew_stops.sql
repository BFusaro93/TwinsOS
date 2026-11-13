-- Snow: more than one crew on a stop (e.g. two trucks on a big lot).
--
-- A storm stop could only ever have one crew: crm_add_visit_crew refused snow
-- visits, and the unique index on (job, storm, push) would have rejected the
-- extra crew's sibling visit anyway. Both are relaxed:
--   * the index now ignores secondary (extra-crew) visits — the lead is still
--     unique per (job, storm, push);
--   * crm_add_visit_crew no longer refuses snow / storm visits.
-- Billing stays with the lead: secondary visits are recorded (their crew, times
-- and hours) but never billed — see isUnbilledSnowVisit in src/lib/snow-billing.ts.

drop index if exists public.crm_job_visits_job_storm_event_unique;
create unique index if not exists crm_job_visits_job_storm_event_unique
  on public.crm_job_visits (job_id, storm_event_id, push_number)
  where storm_event_id is not null and deleted_at is null and not crew_group_secondary;

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
   where id = p_visit_id and org_id = v_org and deleted_at is null;
  if not found then
    raise exception 'Visit not found';
  end if;

  -- Always clone from the group's lead.
  if v_pick.crew_group_id is not null then
    select * into v_lead from crm_job_visits
     where crew_group_id = v_pick.crew_group_id and not crew_group_secondary and deleted_at is null
     limit 1;
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
