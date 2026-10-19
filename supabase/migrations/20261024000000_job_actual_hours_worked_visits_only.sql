-- crm_jobs.actual_hours (read by rpt_jobs, the KPI scorecard and any job-level
-- hours report) summed EVERY live visit's hours, including visits that haven't
-- happened. A scheduled visit with a Start/End on the board has a planned
-- window, and that planned window was being counted as hours worked: on TEST
-- 4 scheduled visits added 4.3 "actual" hours to jobs whose completed visits
-- totalled 8.0, while the visit-level reports (rpt_job_visits, filtered to
-- completed/in-progress) correctly showed 8.0.
--
-- Same body as 20260926200000 (breaks netted off, overnight = next day, an
-- explicit actual_hours override taken as-is) with one change: only visits
-- that were actually worked (completed or in progress) count. The trigger now
-- also watches `status` (and the pause/break columns), so a visit counts the
-- moment it is started or completed and drops out if it is reopened or
-- cancelled. Affected jobs are recomputed once below.

create or replace function public.crm_recompute_job_actual_hours(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update crm_jobs
  set actual_hours = (
    select coalesce(sum(
      coalesce(
        v.actual_hours,
        case
          when v.clocked_in_at is not null and v.clocked_out_at is not null
           and v.clocked_out_at > v.clocked_in_at
          then greatest(0, extract(epoch from (v.clocked_out_at - v.clocked_in_at)) / 3600.0
                           - coalesce(v.break_minutes, 0) / 60.0)
             * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
        end,
        case
          when v.start_time is not null and v.end_time is not null
           and v.end_time <> v.start_time
          then greatest(0, extract(epoch from (
                   case when v.end_time > v.start_time
                        then v.end_time - v.start_time
                        else (v.end_time + interval '24 hours') - v.start_time
                   end
                 )) / 3600.0
                 - coalesce(v.break_minutes, 0) / 60.0)
             * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
        end
      )
    ), 0)
    from crm_job_visits v
    where v.job_id = p_job_id
      and v.deleted_at is null
      and v.status in ('completed', 'in_progress')
  )
  where id = p_job_id;
end;
$function$;

drop trigger if exists trg_crm_job_visits_recompute_actual_hours on crm_job_visits;
create trigger trg_crm_job_visits_recompute_actual_hours
after insert or delete or update of
  actual_hours, clocked_in_at, clocked_out_at, start_time, end_time, men_count,
  break_minutes, status, deleted_at, job_id
on crm_job_visits
for each row execute function crm_job_visits_recompute_actual_hours_trigger();

-- Backfill: only jobs that have a not-yet-worked visit carrying hours-bearing
-- fields can currently be overstated.
select crm_recompute_job_actual_hours(j.id)
from crm_jobs j
where exists (
  select 1
  from crm_job_visits v
  where v.job_id = j.id
    and v.deleted_at is null
    and v.status not in ('completed', 'in_progress')
    and (
      v.actual_hours is not null
      or (v.clocked_in_at is not null and v.clocked_out_at is not null)
      or (v.start_time is not null and v.end_time is not null)
    )
);
