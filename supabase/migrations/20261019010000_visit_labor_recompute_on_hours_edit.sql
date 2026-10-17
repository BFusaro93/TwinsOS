-- A visit the crew clocked out of stores its labor cost in
-- crm_job_visits.actual_labor_cost_cents (Σ crew punches × burden rate), and
-- rpt_job_visits prefers that stored figure whenever it is > 0. Punch edits
-- (Edit Job Times, break-paid) refresh it through recomputeStopLabor(), but an
-- office edit to the visit's own hours — the visit sheet's Actual hours or
-- Men, a Start/End change that isn't mirrored into the punches — left the
-- stored figure frozen at the old punches while the hours moved, so job
-- costing showed new hours against old labor.
--
-- When a visit's hours inputs genuinely change and the same statement did not
-- also write a labor figure, reset the stored labor to 0 (the column is NOT NULL,
-- and rpt_job_visits already treats 0 as "no stored figure"): rpt_job_visits then falls
-- back to man-hours × the crew's average rate (labor_cost_source 'estimated'),
-- which tracks the edited hours. Callers that re-derive labor from punches
-- (the crew clock-out routes, recomputeStopLabor) write it in a later
-- statement and so restore the precise figure. The job-level rollup is
-- re-summed from the visits so crm_jobs.actual_labor_cost_cents stays in step.

create or replace function crm_job_visits_clear_stale_labor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(old.actual_labor_cost_cents, 0) > 0
     and new.actual_labor_cost_cents is not distinct from old.actual_labor_cost_cents
     and (
       new.actual_hours is distinct from old.actual_hours
       or new.men_count is distinct from old.men_count
       or new.start_time is distinct from old.start_time
       or new.end_time is distinct from old.end_time
       or new.clocked_in_at is distinct from old.clocked_in_at
       or new.clocked_out_at is distinct from old.clocked_out_at
       or new.break_minutes is distinct from old.break_minutes
       or new.break_paid is distinct from old.break_paid
     )
  then
    new.actual_labor_cost_cents := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_job_visits_clear_stale_labor on crm_job_visits;
create trigger trg_crm_job_visits_clear_stale_labor
before update of actual_hours, men_count, start_time, end_time, clocked_in_at, clocked_out_at, break_minutes, break_paid
on crm_job_visits
for each row execute function crm_job_visits_clear_stale_labor();

create or replace function crm_job_visits_rollup_job_labor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update crm_jobs
  set actual_labor_cost_cents = (
    select coalesce(sum(v.actual_labor_cost_cents), 0)
    from crm_job_visits v
    where v.job_id = new.job_id and v.deleted_at is null
  )
  where id = new.job_id;
  return new;
end;
$$;

drop trigger if exists trg_crm_job_visits_rollup_job_labor on crm_job_visits;
-- Not `update of actual_labor_cost_cents`: that only fires when the column is in
-- the statement's SET list, and the clear trigger above changes it behind the
-- scenes. The WHEN clause keeps this cheap for every other visit update.
create trigger trg_crm_job_visits_rollup_job_labor
after update
on crm_job_visits
for each row
when (coalesce(old.actual_labor_cost_cents, 0) > 0 and coalesce(new.actual_labor_cost_cents, 0) = 0)
execute function crm_job_visits_rollup_job_labor();

-- Trigger functions only; not meant to be callable as RPC endpoints.
revoke execute on function crm_job_visits_clear_stale_labor() from public;
revoke execute on function crm_job_visits_rollup_job_labor() from public;
