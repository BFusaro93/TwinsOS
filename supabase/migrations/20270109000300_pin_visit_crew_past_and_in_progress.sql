-- Job crew change: also keep PAST and in-progress visits with the crew that had them.
--
-- What/why: most visits carry crew_id NULL and inherit the job's crew (effective
-- crew = coalesce(visit.crew_id, job.crew_id) unless crew_unassigned). The
-- 20261231000200 trigger pins NULL-crew visits that were clocked into or are
-- completed / skipped onto the PREVIOUS crew when crm_jobs.crew_id changes, so
-- the new crew doesn't inherit them. It missed two cases the round-15 audit found:
--   * a visit with status 'in_progress' but no clocked_in_at (started from the
--     office / board, or a stop whose clock-in was cleared), and
--   * any visit dated before the org's today (missed / not-yet-closed-out work,
--     cancelled history). Those re-credited to the new crew in route reports,
--     crew filters and the crew app's history after a crew change.
-- Now every NULL-crew visit of the job that is in progress (status or clock),
-- completed / skipped, or scheduled before org_today(org) is stamped with the
-- previous crew. Upcoming (today and later), unstarted visits still inherit the
-- new crew, as before, and propagateCrewToVisits keeps its own rules for visits
-- that carry an explicit crew.
--
-- Safety: the trigger only writes the crew the visit ALREADY resolved to, so it
-- is a no-op for every reader. It runs SECURITY DEFINER inside the job update,
-- so enforce_crm_job_visit_schedule_write's direct-user check is skipped (as it
-- is for every other trigger-made change). It doesn't touch hours / clock /
-- break columns, so the payroll lock (zz_crm_job_visits_payroll_lock fires only
-- on those) never blocks it, and visit-changed automations are app-level (bulk
-- update / clock routes), so none fire. The audit log records the crew pin.
-- Multi-crew stops (crew_group_id): a member that inherited the job's crew is
-- pinned the same way (keeps its crew); members with an explicit crew are left
-- alone. crew_unassigned visits are never touched. Deleted visits are skipped.
--
-- PROD: apply BEFORE or AFTER the code deploy (independent of app code). No
-- pre-check needed (no new constraint; only changes future crew changes).

create or replace function public.fn_crm_jobs_pin_visit_crew_on_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date;
begin
  if old.crew_id is null or new.crew_id is not distinct from old.crew_id then
    return null;
  end if;

  v_today := public.org_today(new.org_id);

  update public.crm_job_visits v
     set crew_id = old.crew_id
   where v.job_id = new.id
     and v.org_id = new.org_id
     and v.crew_id is null
     and coalesce(v.crew_unassigned, false) = false
     and v.deleted_at is null
     and (
       v.clocked_in_at is not null
       or v.status in ('in_progress', 'completed', 'skipped')
       or v.scheduled_date < v_today
     );

  return null;
end;
$function$;

revoke all on function public.fn_crm_jobs_pin_visit_crew_on_change() from public, anon, authenticated;

drop trigger if exists trg_crm_jobs_pin_visit_crew_on_change on public.crm_jobs;
create trigger trg_crm_jobs_pin_visit_crew_on_change
  after update of crew_id on public.crm_jobs
  for each row
  when (old.crew_id is distinct from new.crew_id)
  execute function public.fn_crm_jobs_pin_visit_crew_on_change();
