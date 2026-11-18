-- Bug sweep round 15 (area 5, F5): renaming a schedule could strand its jobs.
--
-- Jobs point at their schedule BY NAME (crm_jobs.schedule). useUpdateCRMSchedule
-- renamed the crm_schedules row, then repointed the jobs in a SECOND, separate
-- client write. If that second write failed — or matched fewer rows than exist
-- because RLS let the user change the schedule but not every job — the jobs kept
-- the old name: the generator then fell back to parsing the old name as a legacy
-- "Weekly - Monday" pattern (wrong cadence or no visits), and nothing told the user.
--
-- crm_rename_schedule(p_schedule_id, p_name) does both in ONE transaction and
-- verifies no job is left on the old name; otherwise it raises and nothing changes.
--
-- SECURITY INVOKER: the caller's RLS, the plan / read-only gates and
-- enforce_crm_schedule_write_permission (scheduling_settings) apply to the rename
-- exactly as they did to the direct update, and the job repoint runs with the
-- caller's own crm_jobs rights. Returns the number of jobs moved.
-- Errors: 23505 (name taken) passes through for the UI's existing message; a
-- partial repoint raises 42501 with a clear message.
--
-- PROD: apply BEFORE the code deploy (the hook calls this RPC). No pre-check.

create or replace function public.crm_rename_schedule(p_schedule_id uuid, p_name text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old   text;
  v_new   text := btrim(coalesce(p_name, ''));
  v_moved integer := 0;
begin
  if v_new = '' then
    raise exception 'Schedule name is required' using errcode = '22023';
  end if;

  select name into v_old
    from crm_schedules
   where id = p_schedule_id and deleted_at is null
   for update;
  if not found then
    raise exception 'Schedule not found' using errcode = 'P0002';
  end if;

  update crm_schedules set name = v_new where id = p_schedule_id;

  if v_old is distinct from v_new then
    update crm_jobs
       set schedule = v_new
     where org_id = my_org_id()
       and schedule = v_old;
    get diagnostics v_moved = row_count;

    -- RLS skips rows the caller may not update instead of failing: refuse rather
    -- than leave some jobs on a name that no longer exists.
    if exists (select 1 from crm_jobs where org_id = my_org_id() and schedule = v_old) then
      raise exception 'Some jobs on this schedule couldn''t be updated with your access, so it wasn''t renamed. Ask an admin to rename it.'
        using errcode = '42501';
    end if;
  end if;

  return v_moved;
end;
$$;

revoke all on function public.crm_rename_schedule(uuid, text) from public, anon;
grant execute on function public.crm_rename_schedule(uuid, text) to authenticated;
