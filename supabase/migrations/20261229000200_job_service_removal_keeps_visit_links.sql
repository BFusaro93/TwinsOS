-- Removing a service from a job no longer turns its visits into whole-job visits.
--
-- crm_job_visits.job_service_id was ON DELETE SET NULL. Deleting a
-- crm_job_services row (Job Detail → Services → trash) therefore unlinked EVERY
-- visit of that service — completed, skipped, in progress and the retired
-- (soft-deleted) ones alike. An unlinked visit with an occurrence_date holds
-- that date for every service of the job and counts against every capped
-- service's max_visits (src/lib/visits/generate.ts), so after a hold/resume the
-- job's other services stopped regenerating; and a completed unlinked visit is
-- a whole-job visit, so re-completing or repairing it billed every service.
--
-- New rule (src/lib/visits/job-service-removal.ts):
--   * the service's untouched upcoming visits are retired: soft-deleted with
--     occurrence_date cleared (the same release a hold/cancel prune does);
--   * if the service still has history (any other live visit, or any job
--     product row) it is STOPPED instead of deleted — included = false, so the
--     generator, rate/total rollups, chemical and materials reports skip it —
--     and its visits keep their link;
--   * otherwise its soft-deleted visits are unlinked and released and the row
--     is deleted.
-- The FK becomes NO ACTION so nothing can silently unlink visits again.

-- 1. FK: refuse instead of SET NULL. NO ACTION (not RESTRICT) so a hard
--    delete of a crm_jobs row, which cascades to both tables in one
--    statement, still works.
alter table public.crm_job_visits drop constraint if exists crm_job_visits_job_service_id_fkey;
alter table public.crm_job_visits
  add constraint crm_job_visits_job_service_id_fkey
  foreign key (job_service_id) references public.crm_job_services(id) not valid;
alter table public.crm_job_visits validate constraint crm_job_visits_job_service_id_fkey;

-- 2. A stopped (included = false) service no longer counts toward the job's
--    budgeted hours — the rate and total rollups already skip it.
create or replace function public.crm_recompute_job_budgeted_hours(p_job_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update crm_jobs
  set budgeted_hours = (
    select coalesce(sum(coalesce(s.budgeted_hours, 0) * coalesce(s.team_size, 1)), 0)
    from crm_job_services s
    where s.job_id = p_job_id
      and coalesce(s.included, true)
  )
  where id = p_job_id;
end;
$function$;

drop trigger if exists trg_crm_job_services_recompute_budgeted_hours on public.crm_job_services;
create trigger trg_crm_job_services_recompute_budgeted_hours
  after insert or delete or update of budgeted_hours, team_size, included, job_id
  on public.crm_job_services
  for each row execute function public.crm_job_services_recompute_budgeted_hours_trigger();

-- 3. Repair visits a service deletion already unlinked. The deleted service id
--    is gone, so the link can't be restored; the audit trail records the
--    cascade ("job service id: <uuid> → blank"), which identifies them.
--      * retired rows (soft-deleted) still holding an occurrence → release it;
--      * untouched upcoming rows (scheduled/dispatched, never clocked in, on or
--        after the org's today, not on an invoice) → retire + release, exactly
--        what removing the service does now;
--      * anything else (completed, skipped, in progress, past) is history and
--        is left as it is — reported below.
do $repair$
declare
  v_released integer;
  v_retired  integer;
  v_history  integer;
begin
  create temp table _orphaned_service_visits on commit drop as
  select distinct v.id
    from public.audit_log al
    join public.crm_job_visits v on v.id = al.record_id
   where al.record_type = 'job_visit'
     and al.description ~ 'job service id: [0-9a-f-]{36} → blank'
     and v.job_service_id is null
     and not exists (
       select 1 from public.crm_job_services s
        where s.id = substring(al.description from 'job service id: ([0-9a-f-]{36}) → blank')::uuid
     );

  update public.crm_job_visits v
     set occurrence_date = null
   where v.id in (select id from _orphaned_service_visits)
     and v.deleted_at is not null
     and v.occurrence_date is not null;
  get diagnostics v_released = row_count;

  update public.crm_job_visits v
     set deleted_at = now(), occurrence_date = null
   where v.id in (select id from _orphaned_service_visits)
     and v.deleted_at is null
     and v.status in ('scheduled', 'dispatched')
     and v.clocked_in_at is null
     and v.scheduled_date >= public.org_today(v.org_id)
     and not exists (select 1 from public.crm_invoice_line_items li where li.visit_id = v.id);
  get diagnostics v_retired = row_count;

  select count(*) into v_history
    from public.crm_job_visits v
   where v.id in (select id from _orphaned_service_visits)
     and v.deleted_at is null;

  raise notice 'job service orphan repair: % retired occurrences released, % untouched upcoming visits retired, % live visits left unlinked (history)',
    v_released, v_retired, v_history;
end
$repair$;
