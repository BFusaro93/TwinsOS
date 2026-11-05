-- A one-time job only ever closed when its last visit was COMPLETED
-- (complete-visit-side-effects.ts). Cancelling or skipping the last open
-- visit left the job "scheduled" with nothing on the board — e.g. a split job
-- whose first service was completed and whose second was then cancelled, or a
-- job whose only visit was cancelled.
--
-- After a visit's status changes to cancelled or skipped, look at the job's
-- live visits (one_time jobs that are still scheduled / in progress only):
--   * any visit still open, or an included service with no visit yet on a
--     split job -> leave the job alone (same coverage rule as completion);
--   * otherwise, at least one completed visit -> the job is completed, exactly
--     what completing that last visit would have done (skipped / cancelled
--     siblings count as resolved there too);
--   * otherwise every visit was cancelled -> the job is cancelled;
--   * a skip with nothing completed leaves the job open: a skipped visit is
--     work still owed, which the office reschedules.
-- Waiting-list jobs are deliberately excluded: a cancelled or skipped
-- waiting-list visit puts its service back on the Waiting List.
--
-- The job update runs as a trigger cascade, so enforce_job_cancel_permission
-- now exempts cascades (pg_trigger_depth() > 1) like the other #406/#410
-- guards do (_crm_direct_user_write) — a scheduler cancelling the last visit
-- is allowed to, and the job following it is not a separate decision.

create or replace function public.close_one_time_job_when_visits_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_type text;
  v_job_status text;
  v_open integer;
  v_completed integer;
  v_not_cancelled integer;
  v_uncovered integer;
begin
  if new.status not in ('cancelled', 'skipped')
     or old.status is not distinct from new.status
     or new.deleted_at is not null then
    return new;
  end if;

  select j.job_type, j.status into v_job_type, v_job_status
  from public.crm_jobs j
  where j.id = new.job_id and j.deleted_at is null;

  if v_job_type is distinct from 'one_time'
     or v_job_status not in ('scheduled', 'in_progress') then
    return new;
  end if;

  select count(*) filter (where v.status not in ('completed', 'cancelled', 'skipped')),
         count(*) filter (where v.status = 'completed'),
         count(*) filter (where v.status <> 'cancelled')
    into v_open, v_completed, v_not_cancelled
  from public.crm_job_visits v
  where v.job_id = new.job_id and v.deleted_at is null;

  if v_open > 0 then
    return new;
  end if;

  -- A split job dispatches one visit per service: an included service with no
  -- visit yet is unfinished work (unless a whole-job visit covers them all).
  if not exists (
    select 1 from public.crm_job_visits v
    where v.job_id = new.job_id and v.deleted_at is null and v.job_service_id is null
  ) then
    select count(*) into v_uncovered
    from public.crm_job_services s
    where s.job_id = new.job_id
      and coalesce(s.included, true)
      and not exists (
        select 1 from public.crm_job_visits v
        where v.job_id = new.job_id and v.deleted_at is null and v.job_service_id = s.id
      );
    if v_uncovered > 0 then
      return new;
    end if;
  end if;

  if v_completed > 0 then
    update public.crm_jobs set status = 'completed', is_complete = true
    where id = new.job_id;
  elsif v_not_cancelled = 0 then
    update public.crm_jobs set status = 'cancelled'
    where id = new.job_id;
  end if;

  return new;
end;
$$;

revoke all on function public.close_one_time_job_when_visits_resolved() from public, anon, authenticated;

drop trigger if exists trg_crm_job_visits_close_one_time_job on public.crm_job_visits;
create trigger trg_crm_job_visits_close_one_time_job
  after update of status on public.crm_job_visits
  for each row
  execute function public.close_one_time_job_when_visits_resolved();

-- Re-stated from 20261202000100 with one change: a trigger cascade (depth > 1)
-- is exempt, so the job following its last visit isn't refused for a login
-- that may cancel visits but not jobs.
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
     and pg_trigger_depth() <= 1
     and not public.has_settings_permission('job_cancel') then
    raise exception 'You do not have permission to cancel jobs'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
