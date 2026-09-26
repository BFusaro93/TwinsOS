-- crm_recompute_job_actual_hours had split across environments:
--   * PROD ran 20260825020000_fix_overnight_actual_hours (scheduled times that
--     cross midnight count as end + 24h) but never got the break deduction;
--   * TEST ran 20260910160100_deduct_break_minutes_from_actual_hours, which
--     re-created the function from an older body and silently dropped the
--     overnight handling (end_time > start_time only).
-- This is the union of both: breaks are netted off both derived tiers (floored
-- at 0, before the men multiplier) and a scheduled end at or before the start
-- is treated as the next day. An explicit actual_hours override is still taken
-- as-is. Applied to both PROD and TEST so they match again.

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
  )
  where id = p_job_id;
end;
$function$;
