-- Job Detail's "Recurring Schedule" picker wrote a synthesized string
-- ("Weekly - Monday", "Bi-weekly - Monday - Even Weeks") into
-- crm_jobs.schedule and the picked schedule's real name into recurrence_rule.
-- Everything that resolves a job's schedule (the visit generator, Settings →
-- Schedules reschedule, rename carry-over, the is_active switch) looks it up
-- BY NAME in crm_jobs.schedule, so those jobs fell back to parsing the
-- synthesized string: frequency, season window, skip dates, anchor and custom
-- dates were all ignored (an every-3-weeks seasonal schedule became weekly,
-- all year).
--
-- The picker now writes schedule = <schedule name>, schedule_days = '{}',
-- recurrence_rule = null, exactly like New Job. This repairs existing rows:
-- recurrence_rule names a live schedule in the same org while schedule does
-- not. Visits are NOT touched here — after deploy, reschedule the affected
-- jobs (Job Detail → edit, or Settings → Schedules → save) so their upcoming
-- visits follow the real schedule.
update public.crm_jobs j
set schedule = j.recurrence_rule,
    schedule_days = '{}'::text[],
    recurrence_rule = null
where j.deleted_at is null
  and j.recurrence_rule is not null
  and exists (
    select 1 from public.crm_schedules s
    where s.org_id = j.org_id
      and s.deleted_at is null
      and s.name = j.recurrence_rule
  )
  and not exists (
    select 1 from public.crm_schedules s2
    where s2.org_id = j.org_id
      and s2.deleted_at is null
      and s2.name = j.schedule
  );
