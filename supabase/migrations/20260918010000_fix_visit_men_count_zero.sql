-- crm_job_visits.men_count defaulted to 0 (crm_jobs.man_count correctly
-- defaults to 1), and the nightly recurring-visits cron
-- (src/app/api/cron/recurring-visits/route.ts) never set it explicitly on
-- insert, so it silently fell back to that 0 default for nearly every
-- auto-generated visit. Editing any such visit then hit the "Men count must
-- be a valid positive number" validation in DispatchBoard.tsx's save handler,
-- which requires a positive value — blocking the edit entirely, since the
-- form pre-fills whatever is already stored.
--
-- Backfill existing 0 values from the parent job's man_count (falling back to
-- 1), and fix the column default so newly-generated visits stop landing on 0
-- even if some future insert path forgets to set it explicitly, same as the
-- app code now does in recurring-visits/route.ts.

update crm_job_visits v
set men_count = greatest(1, coalesce(j.man_count, 1))
from crm_jobs j
where j.id = v.job_id
  and v.men_count = 0;

alter table crm_job_visits alter column men_count set default 1;
