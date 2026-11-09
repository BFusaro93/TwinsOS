-- Settings → Schedules "Keep existing visits".
--
-- Editing a schedule and choosing to keep the visits already on the calendar
-- used to do nothing — and the daily cron then generated the NEW schedule's
-- dates alongside the old ones, so a week could get two visits. Now each
-- recurring job on the schedule records the last date it already has a visit
-- on; the generator (src/lib/visits/generate.ts) only creates visits strictly
-- after it. An explicit reschedule (Update visits, or a schedule / start-date
-- change in Job Detail) replaces the visits instead and clears it.

alter table public.crm_jobs
  add column if not exists generate_visits_after date;

comment on column public.crm_jobs.generate_visits_after is
  'Recurring jobs: the visit generator only creates visits on dates strictly after this one. Set by Settings → Schedules "Keep existing visits" to the last visit already on the calendar; cleared by a reschedule that replaces visits.';
