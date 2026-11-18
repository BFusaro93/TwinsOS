-- Bug sweep round 15 (area 5, F1): visit/job automations enrolled a client only
-- once EVER.
--
-- A visit-event automation ("Visit was completed" -> send a review request) deduped
-- on the CLIENT: isEligibleForEnrollment looked for the client's latest enrollment
-- in the sequence and, with allow_reentry off (the default), refused every later
-- visit forever. visit_id (round 14) was stored but never used for dedupe.
--
-- Decision: ONCE PER CLIENT PER SERVICE DAY for visit-scoped triggers
-- (visit_completed, service_visit_completed, visit_dispatched, visit_skipped,
-- visit_cancelled, visit_date_changed, visit_moved_to_waiting_list). NOT once per
-- visit: a stop groups several visits (one per service at the property, plus one
-- per crew on a multi-crew stop) that are dispatched / clocked out together, and
-- per-visit runs sent one text per sibling. Two visits of the same client on the
-- same org-local date (any services, crews or properties) produce ONE run per
-- sequence; a visit on another day starts a new one. The run stores that date in
-- the new visit_date column (the visit's scheduled_date — the NEW date for
-- visit_date_changed) and keeps visit_id = the lead/first visit for the snow merge
-- tags. A finished run still blocks the same day unless allow_reentry + its window.
--
-- Job-scoped runs (job_created, job_cancelled, package_created, package_renewed)
-- dedupe on (sequence_id, job_id) via the new nullable job_id column — no existing
-- column can carry the job.
--
-- Changes (idempotent; an earlier draft of this file created a per-visit index on
-- TEST, dropped here):
--  1. crm_sequence_enrollments.visit_date date and .job_id uuid (FK, on delete set
--     null). Nullable, no backfill: older rows are client-level history.
--  2. crm_sequence_enrollments_active_client_uidx no longer covers visit-day or
--     job runs (visit_date IS NULL AND job_id IS NULL). A row with only visit_id
--     (round 14) is still client-level, exactly as before.
--  3. Partial unique indexes on active (sequence_id, client_id, visit_date) and
--     (sequence_id, job_id) — race-safe for siblings completing concurrently
--     (the loser gets 23505, which enrollClientInSequence treats as "already
--     enrolled") — plus lookup indexes for the eligibility query.
--
-- PROD: apply BEFORE the code deploy (the new code inserts visit_date / job_id).
-- PRE-CHECK on PROD: none of the new indexes can collide (both columns are new and
-- NULL), and the client index only narrows. Sanity check, must return 0 rows:
--   select sequence_id, client_id, count(*) from crm_sequence_enrollments
--    where estimate_id is null and ticket_id is null and invoice_id is null and meeting_id is null
--      and completed_at is null and stopped_at is null and deleted_at is null
--    group by 1, 2 having count(*) > 1;

alter table public.crm_sequence_enrollments
  add column if not exists visit_date date;
alter table public.crm_sequence_enrollments
  add column if not exists job_id uuid references public.crm_jobs(id) on delete set null;

comment on column public.crm_sequence_enrollments.visit_date is
  'Service day (the visit''s scheduled_date, org-local) of a visit-event run: such runs dedupe per client per day, not per client forever.';
comment on column public.crm_sequence_enrollments.job_id is
  'The job a job-event trigger (job_created, job_cancelled, package_created, package_renewed) fired for — such runs dedupe per job, not per client.';

-- Superseded draft objects (TEST only).
drop index if exists public.crm_sequence_enrollments_active_visit_uidx;
drop index if exists public.crm_sequence_enrollments_seq_visit_idx;

drop index if exists public.crm_sequence_enrollments_active_client_uidx;
create unique index crm_sequence_enrollments_active_client_uidx
  on public.crm_sequence_enrollments (sequence_id, client_id)
  where estimate_id is null and ticket_id is null and invoice_id is null and meeting_id is null
    and visit_date is null and job_id is null
    and completed_at is null and stopped_at is null and deleted_at is null;

create unique index if not exists crm_sequence_enrollments_active_visit_day_uidx
  on public.crm_sequence_enrollments (sequence_id, client_id, visit_date)
  where visit_date is not null and completed_at is null and stopped_at is null and deleted_at is null;

create unique index if not exists crm_sequence_enrollments_active_job_uidx
  on public.crm_sequence_enrollments (sequence_id, job_id)
  where job_id is not null and completed_at is null and stopped_at is null and deleted_at is null;

create index if not exists crm_sequence_enrollments_seq_visit_day_idx
  on public.crm_sequence_enrollments (sequence_id, client_id, visit_date, enrolled_at desc)
  where deleted_at is null and visit_date is not null;

create index if not exists crm_sequence_enrollments_seq_job_idx
  on public.crm_sequence_enrollments (sequence_id, job_id, enrolled_at desc)
  where deleted_at is null and job_id is not null;

-- FK lookups when a job is (hard) removed.
create index if not exists crm_sequence_enrollments_job_id_idx
  on public.crm_sequence_enrollments (job_id) where job_id is not null;
