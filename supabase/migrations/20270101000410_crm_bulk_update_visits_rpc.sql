-- crm_bulk_update_visits: the dispatch board's bulk Change Status / Move /
-- Re-crew, applied in ONE transaction.
--
-- /api/crm/visits/bulk-update wrote its batch in 100-row chunks with no status
-- check, so (a) a crew clocking in between the route's read and its write had
-- the visit overwritten by a stale "dispatched" / date move (the single-visit
-- PATCH already matches the status it validated), and (b) a failure part-way
-- (a trigger refusal on row 140) left the first chunk applied. Each row now
-- updates only while its status is still the one the route read
-- (expected_status), and any row that changed — or any trigger refusal —
-- raises, rolling back every row.
--
-- SECURITY INVOKER on purpose: RLS and every crm_job_visits trigger (invoiced
-- guard, Min Days, the scheduling-key guard
-- enforce_crm_job_visit_schedule_write) still run as the caller. The keys are
-- also checked here up front so a caller without one gets one clear error.
--
-- p_rows   [{ "id": uuid, "expected_status": text, "clear_clock": bool }]
--          (at most 500). clear_clock clears clocked_in_at / clocked_out_at /
--          completed_at / paused_at (reopening a finished visit).
-- p_patch  any of scheduled_date, status, crew_id, crew_unassigned, priority,
--          skip_reason. A key that is absent leaves the column alone; a JSON
--          null sets it null. dispatched_at is stamped on a transition into
--          'dispatched'.
-- Raises with hint 'visit_changed' (detail = the visit id) when a row is gone
-- or its status no longer matches. Returns the number of rows updated.

create or replace function public.crm_bulk_update_visits(p_rows jsonb, p_patch jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  v_hit integer;
  v_total integer := 0;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'At most 500 visits per bulk update' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_patch) k
    where k not in ('scheduled_date', 'status', 'crew_id', 'crew_unassigned', 'priority', 'skip_reason')
  ) then
    raise exception 'Unsupported field in bulk visit update' using errcode = '22023';
  end if;
  if not public._crm_has_any_permission(array[
    'sched_dispatch_board', 'sched_waiting_list', 'snow_dispatch_manage', 'job_add'
  ]) then
    raise exception 'You do not have permission to change the schedule' using errcode = '42501';
  end if;

  for r in
    select (e ->> 'id')::uuid as id,
           e ->> 'expected_status' as expected_status,
           coalesce((e ->> 'clear_clock')::boolean, false) as clear_clock
    from jsonb_array_elements(p_rows) e
  loop
    update public.crm_job_visits v
       set scheduled_date  = case when v_patch ? 'scheduled_date' then (v_patch ->> 'scheduled_date')::date else v.scheduled_date end,
           status          = case when v_patch ? 'status' then v_patch ->> 'status' else v.status end,
           crew_id         = case when v_patch ? 'crew_id' then (v_patch ->> 'crew_id')::uuid else v.crew_id end,
           crew_unassigned = case when v_patch ? 'crew_unassigned' then coalesce((v_patch ->> 'crew_unassigned')::boolean, false) else v.crew_unassigned end,
           priority        = case when v_patch ? 'priority' then (v_patch ->> 'priority')::integer else v.priority end,
           skip_reason     = case when v_patch ? 'skip_reason' then v_patch ->> 'skip_reason' else v.skip_reason end,
           dispatched_at   = case when v_patch ->> 'status' = 'dispatched' and v.status is distinct from 'dispatched'
                                  then now() else v.dispatched_at end,
           clocked_in_at   = case when r.clear_clock then null else v.clocked_in_at end,
           clocked_out_at  = case when r.clear_clock then null else v.clocked_out_at end,
           completed_at    = case when r.clear_clock then null else v.completed_at end,
           paused_at       = case when r.clear_clock then null else v.paused_at end,
           updated_at      = now()
     where v.id = r.id
       and v.deleted_at is null
       and (r.expected_status is null or v.status = r.expected_status);
    get diagnostics v_hit = row_count;
    if v_hit = 0 then
      raise exception 'A selected visit changed since it was read'
        using errcode = 'P0001', hint = 'visit_changed', detail = r.id::text;
    end if;
    v_total := v_total + v_hit;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.crm_bulk_update_visits(jsonb, jsonb) from public, anon;
grant execute on function public.crm_bulk_update_visits(jsonb, jsonb) to authenticated, service_role;
