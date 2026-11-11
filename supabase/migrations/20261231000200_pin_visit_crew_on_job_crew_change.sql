-- A job's crew change must not hand a running (or finished) stop to the new crew.
--
-- Most visits carry crew_id NULL and inherit the job's crew (effective crew =
-- coalesce(visit.crew_id, job.crew_id), unless crew_unassigned). Changing the
-- job's crew mid-day therefore re-pointed every NULL-crew visit at once,
-- including the one the old crew was clocked into: the old crew's Stop / Pause /
-- Skip then 404'd (RLS follows the same rule), its punches stayed open, and the
-- new crew saw a stop it never started. Finished visits re-attributed the same
-- way, so history (route reports, crew filters) moved to the new crew.
--
-- propagateCrewToVisits (app + public API) deliberately skips clocked-in and
-- finished visits, so it never fixed this. This trigger runs on EVERY path that
-- changes crm_jobs.crew_id (app, public API, MCP, bulk edits): before the new
-- crew takes effect, each NULL-crew visit that was started (clocked in, running
-- or not) or already completed / skipped is pinned to the PREVIOUS crew — the
-- crew it effectively belonged to a moment ago. Pinning only writes the value
-- the visit already resolved to, so it is a no-op for every reader, multi-crew
-- stops (crew_group_id) included: their crews are set per visit and are left
-- alone unless one inherited the job's crew, which is preserved as-is.
-- crew_unassigned visits are never touched (they resolve to no crew).
-- Upcoming, unstarted visits keep inheriting, so the new crew still gets them.

create or replace function public.fn_crm_jobs_pin_visit_crew_on_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.crew_id is null or new.crew_id is not distinct from old.crew_id then
    return null;
  end if;

  update public.crm_job_visits v
     set crew_id = old.crew_id
   where v.job_id = new.id
     and v.org_id = new.org_id
     and v.crew_id is null
     and coalesce(v.crew_unassigned, false) = false
     and v.deleted_at is null
     and (
       v.clocked_in_at is not null
       or v.status in ('completed', 'skipped')
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
