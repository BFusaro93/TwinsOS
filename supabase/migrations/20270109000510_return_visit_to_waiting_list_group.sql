-- Bug sweep round 15 (area 5, F4): "Return to Waiting List" on a multi-crew stop
-- only returned the clicked crew's visit.
--
-- A multi-crew stop is one visit per crew sharing crew_group_id. The route
-- soft-deleted (waiting-list job) or reset (package step) only the selected
-- visit, so:
--  - waiting-list job: the other crew's visit stayed live, so the job kept a
--    live visit — it never reappeared on the Waiting List, yet the stop had
--    lost a crew (the lead failover trigger just promoted the survivor);
--  - package step: the other crew's visit stayed 'dispatched' on the board
--    while the step was back on the Waiting List.
--
-- crm_return_visit_to_waiting_list(p_visit_id) does the whole return in ONE
-- transaction: every live visit on the stop goes back together, and it refuses
-- if ANY crew on the stop has clocked in or the stop has started.
--  - waiting-list job: soft-deletes every visit on the stop; resets the job's
--    scheduled_date / crew_id only when no live visit is left on the job.
--  - package step: keeps ONE visit as the step's placeholder (the stop's lead —
--    the original; the others were cloned from it) reset to 'scheduled', and
--    soft-deletes the other crews' visits.
-- Returns jsonb { returned_visit_ids, kept_visit_id, client_id, job_id, org_id,
-- job_type, scheduled_date }. Errors carry HINT '404' / '409' / '400' for the route.
--
-- SECURITY INVOKER: RLS, the column grants, the scheduling write guard
-- (enforce_crm_job_visit_schedule_write) and every visit trigger apply exactly
-- as they did to the route's direct writes. The route still checks the
-- scheduling permission first.
--
-- PROD: apply BEFORE the code deploy (the route calls this RPC). No pre-check.

create or replace function public.crm_return_visit_to_waiting_list(p_visit_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_visit     record;
  v_job       record;
  v_member    record;
  v_ids       uuid[];
  v_keep      uuid;
  v_delete    uuid[];
  v_remaining integer;
  v_now       timestamptz := now();
begin
  select id, job_id, job_service_id, client_id, scheduled_date, status, clocked_in_at,
         crew_group_id, crew_group_secondary
    into v_visit
    from crm_job_visits
   where id = p_visit_id and deleted_at is null;
  if not found then
    raise exception 'Visit not found' using hint = '404';
  end if;

  -- Every live visit on the stop (just this one when it isn't a multi-crew stop),
  -- locked so a crew can't clock in between the check and the write.
  select array_agg(id order by crew_group_secondary, created_at, id) into v_ids
    from (
      select g.id, g.crew_group_secondary, g.created_at
        from crm_job_visits g
       where g.deleted_at is null
         and (g.id = v_visit.id or (v_visit.crew_group_id is not null and g.crew_group_id = v_visit.crew_group_id))
       for update
    ) s;

  -- Only a stop that was dispatched but never worked can go back: once any crew on it
  -- has clocked in (or it's in progress/completed/skipped) there is real history here.
  for v_member in
    select id, status, clocked_in_at from crm_job_visits where id = any(v_ids)
  loop
    if v_member.status not in ('scheduled', 'dispatched') or v_member.clocked_in_at is not null then
      if v_member.id = v_visit.id then
        raise exception 'Only a scheduled or dispatched visit that hasn''t been clocked in can be returned to the waiting list'
          using hint = '409';
      end if;
      raise exception 'Another crew on this multi-crew stop has already started it, so the stop can''t go back to the waiting list'
        using hint = '409';
    end if;
  end loop;

  select id, org_id, job_type into v_job from crm_jobs where id = v_visit.job_id;
  if not found then
    raise exception 'Job not found' using hint = '404';
  end if;
  if v_job.job_type not in ('waiting_list', 'package') then
    raise exception 'Only waiting-list and package jobs can be returned to the waiting list' using hint = '400';
  end if;

  if v_job.job_type = 'package' then
    if v_visit.job_service_id is null then
      raise exception 'This package visit isn''t linked to a step, so it can''t go back to the waiting list' using hint = '400';
    end if;
    if v_visit.status = 'scheduled' then
      raise exception 'This package step isn''t dispatched — it is already on the waiting list' using hint = '409';
    end if;
    -- The stop's lead is the step's original placeholder (the other crews' visits were
    -- cloned from it); v_ids is ordered lead first.
    v_keep := v_ids[1];
    v_delete := v_ids[2:];
    if coalesce(array_length(v_delete, 1), 0) > 0 then
      -- One statement: the group-lead failover / dissolve trigger then sees the whole
      -- stop's change at once and leaves the kept visit as a plain (ungrouped) visit.
      update crm_job_visits set deleted_at = v_now where id = any(v_delete);
    end if;
    update crm_job_visits
       set status = 'scheduled', dispatched_at = null,
           crew_group_id = null, crew_group_secondary = false
     where id = v_keep;
  else
    v_keep := null;
    v_delete := v_ids;
    update crm_job_visits set deleted_at = v_now where id = any(v_ids);

    -- A multi-service waiting-list job is dispatched one service at a time, so other
    -- services may still have live visits. Clearing the job's date and crew under them
    -- would strip the crew from every visit that inherits it — only reset the job once
    -- nothing else is scheduled on it.
    select count(*) into v_remaining
      from crm_job_visits
     where job_id = v_job.id and deleted_at is null;
    if v_remaining = 0 then
      update crm_jobs set scheduled_date = null, crew_id = null where id = v_job.id;
    end if;
  end if;

  return jsonb_build_object(
    'returned_visit_ids', to_jsonb(v_ids),
    'kept_visit_id', v_keep,
    'client_id', v_visit.client_id,
    'job_id', v_job.id,
    'org_id', v_job.org_id,
    'job_type', v_job.job_type,
    'scheduled_date', v_visit.scheduled_date
  );
end;
$$;

revoke all on function public.crm_return_visit_to_waiting_list(uuid) from public, anon;
grant execute on function public.crm_return_visit_to_waiting_list(uuid) to authenticated;
