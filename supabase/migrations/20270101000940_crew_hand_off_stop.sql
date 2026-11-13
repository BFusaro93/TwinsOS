-- Crew-initiated hand-off: crew B can't make it to a stop, so it goes to crew A.
--
-- Crew logins can't change a visit's crew (the office does that). This SECURITY
-- DEFINER function lets a crew login hand a stop its own crew is on to another
-- crew BEFORE it has started: the visit moves to the other crew, dispatched, so
-- it lands on that crew's tablet and drops off the caller's. Same visit, same
-- billing. Refused once the crew has clocked in (use "Need help" then), and for a
-- stop that already has several crews (the office untangles those). Snow stops
-- only for now.

-- Which crew the stop was handed off FROM, so the dispatch boards can flag it.
alter table public.crm_job_visits
  add column if not exists handed_off_from_crew_id uuid references public.crm_crews(id) on delete set null;

comment on column public.crm_job_visits.handed_off_from_crew_id is
  'Set when a crew handed this stop off from the crew app: the crew that could not make it. Shown as a flag on the dispatch boards.';

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
   where id = p_visit_id and org_id = v_org and deleted_at is null;
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
   where id = p_visit_id;

  return p_visit_id;
end;
$function$;

revoke all on function public.crm_crew_hand_off_stop(uuid, uuid) from public, anon;
grant execute on function public.crm_crew_hand_off_stop(uuid, uuid) to authenticated;
