-- job_cancel was enforced only by hiding the Cancel button in JobDetail.tsx;
-- any CRM login could PATCH crm_jobs.status = 'cancelled' straight from the
-- browser. A BEFORE UPDATE trigger now requires has_settings_permission(
-- 'job_cancel') when a job's status CHANGES to 'cancelled'.
--
-- Exempt (checked against every code path that sets crm_jobs.status):
--   * no end-user session (auth.uid() is null: service role, cron, automations,
--     the /api/v1 key-authenticated routes, SECURITY DEFINER jobs run by them)
--   * org admins (has_settings_permission() passes profiles.role = 'admin')
-- Not exempted on purpose: crew logins. No crew route sets a job to cancelled
-- (they only read it to block clock-in), so they have no legitimate path.
-- The visit-cancel cascade (removeJobVisits) cancels crm_job_visits rows, not
-- the job, so it is unaffected. Re-saving an already-cancelled job (status
-- unchanged) is allowed.
create or replace function public.enforce_job_cancel_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'cancelled'
     and old.status is distinct from 'cancelled'
     and auth.uid() is not null
     and not public.has_settings_permission('job_cancel') then
    raise exception 'You do not have permission to cancel jobs'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_jobs_enforce_cancel on public.crm_jobs;
create trigger trg_crm_jobs_enforce_cancel
  before update of status on public.crm_jobs
  for each row
  execute function public.enforce_job_cancel_permission();
