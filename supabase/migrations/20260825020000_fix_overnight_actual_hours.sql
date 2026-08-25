-- crm_recompute_job_actual_hours() only counted a visit's Start/End time
-- fallback when end_time > start_time — a snow/storm shift that crosses
-- midnight (e.g. 23:00 -> 01:00) has end_time < start_time and silently
-- contributed 0 hours instead of the real duration, understating labor
-- cost and job costing for exactly the job type most likely to run
-- overnight. Mirrors the same fix in src/lib/utils/visit-hours.ts's
-- computeActualHours() — keep both in sync per that file's own comment.
create or replace function crm_recompute_job_actual_hours(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update crm_jobs
  set actual_hours = (
    select coalesce(sum(
      coalesce(
        v.actual_hours,
        case
          when v.clocked_in_at is not null and v.clocked_out_at is not null
           and v.clocked_out_at > v.clocked_in_at
          then extract(epoch from (v.clocked_out_at - v.clocked_in_at)) / 3600.0
             * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
        end,
        case
          when v.start_time is not null and v.end_time is not null
           and v.end_time <> v.start_time
          then extract(epoch from (
                 case when v.end_time > v.start_time
                      then v.end_time - v.start_time
                      else (v.end_time + interval '24 hours') - v.start_time
                 end
               )) / 3600.0
             * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
        end
      )
    ), 0)
    from crm_job_visits v
    where v.job_id = p_job_id
      and v.deleted_at is null
  )
  where id = p_job_id;
end;
$$;
