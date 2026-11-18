-- Bug sweep round 15b (area A): automation enrollment scoping + trigger-queue close-out.
--
-- 1. Visit-day dedupe per START TRIGGER. crm_sequence_enrollments_active_visit_day_uidx
--    was (sequence_id, client_id, visit_date): a sequence started by BOTH "Visit was
--    dispatched" and "Visit was completed" had its morning dispatch run block the same
--    day's completion run. The index now includes trigger_type (coalesced, so rows from
--    before trigger_type was stored keep colliding with each other as before), and
--    isEligibleForEnrollment filters on it the same way.
--
-- 2. Once-per-RECORD runs (owner decision 4). form_submitted (per form response),
--    contract_created / contract_signed (per contract), contract_about_to_expire (per
--    contract term: "<contract id>:<end date>"), damage_case_created (per case) and
--    credit_card_about_to_expire (per card: "<payment method id>:<yyyy-mm>") deduped on
--    the CLIENT: a second contract or form response for the same client while the first
--    run was going was silently dropped. New nullable record_type / record_key carry the
--    record (text: a card is a Stripe id, a contract term a composite), with a partial
--    unique index on active runs. The client-level index now excludes record-scoped runs.
--
-- 3. Date-gap re-entry anchors (anchor_key). With Allow Re-Entry on, estimate_no_response
--    re-enrolled the same estimate every ~2 days for the whole 30-day look-back, because
--    only the delay was checked. The run now stores the date it is about (estimate sent_at
--    / valid_until_date, meeting time, card id+expiry, contract end date) and re-entry
--    needs a DIFFERENT anchor. Backfilled below for existing estimate / meeting runs
--    (only where the record wasn't re-sent after that run started); rows left NULL keep
--    the old delay-only rule.
--
-- 4. crm_automation_trigger_queue: rows that used up MAX_ATTEMPTS (5) were never selected
--    again but never closed either (processed_at NULL forever, still in the pending
--    index). New failed_at marks them; skip_reason records rows dropped at drain time
--    (org canceled / no Landscapt module, or the event's premise no longer true).
--
-- All idempotent. Additive columns + index swaps inside one transaction.
--
-- PROD: apply BEFORE the code deploy (the new code inserts record_type / record_key /
-- anchor_key and writes failed_at / skip_reason). Old code keeps working against it.
-- PRE-CHECK on PROD (must return 0 rows; the new indexes only narrow / add columns, so
-- nothing existing can violate them, but confirm the old visit-day index is healthy):
--   select sequence_id, client_id, visit_date, count(*) from crm_sequence_enrollments
--    where visit_date is not null and completed_at is null and stopped_at is null and deleted_at is null
--    group by 1,2,3 having count(*) > 1;

alter table public.crm_sequence_enrollments
  add column if not exists record_type text,
  add column if not exists record_key text,
  add column if not exists anchor_key text;

comment on column public.crm_sequence_enrollments.record_type is
  'Record-scoped run (form_response | contract | contract_term | damage_case | card): with record_key, the run is once per record.';
comment on column public.crm_sequence_enrollments.record_key is
  'The record a record-scoped run is about (uuid, "<contract id>:<end date>", or "<payment method id>:<yyyy-mm>").';
comment on column public.crm_sequence_enrollments.anchor_key is
  'Date-gap triggers: the date the run was created for (estimate sent_at / valid_until_date, meeting time, card expiry, contract end). Re-entry needs a different anchor.';

-- Client-level index: record-scoped runs are no longer client-level.
drop index if exists public.crm_sequence_enrollments_active_client_uidx;
create unique index crm_sequence_enrollments_active_client_uidx
  on public.crm_sequence_enrollments (sequence_id, client_id)
  where estimate_id is null and ticket_id is null and invoice_id is null and meeting_id is null
    and visit_date is null and job_id is null and record_key is null
    and completed_at is null and stopped_at is null and deleted_at is null;

-- Visit-day index: per start trigger.
drop index if exists public.crm_sequence_enrollments_active_visit_day_uidx;
create unique index crm_sequence_enrollments_active_visit_day_uidx
  on public.crm_sequence_enrollments (sequence_id, client_id, visit_date, (coalesce(trigger_type, '')))
  where visit_date is not null and completed_at is null and stopped_at is null and deleted_at is null;

-- Record index + eligibility lookup.
create unique index if not exists crm_sequence_enrollments_active_record_uidx
  on public.crm_sequence_enrollments (sequence_id, record_type, record_key)
  where record_key is not null and completed_at is null and stopped_at is null and deleted_at is null;
create index if not exists crm_sequence_enrollments_seq_record_idx
  on public.crm_sequence_enrollments (sequence_id, record_type, record_key, enrolled_at desc)
  where deleted_at is null and record_key is not null;

-- Anchor backfill (estimate date-gap runs): only when the estimate was not re-sent after the
-- run started, so the current value is the one the run was created for.
update public.crm_sequence_enrollments e
   set anchor_key = case e.trigger_type
         when 'estimate_no_response' then to_char(s.sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         else s.valid_until_date::text
       end
  from public.estimates s
 where s.id = e.estimate_id
   and e.anchor_key is null
   and e.trigger_type in ('estimate_no_response', 'estimate_expiring')
   and s.sent_at is not null
   and s.sent_at <= e.enrolled_at
   and (e.trigger_type = 'estimate_no_response' or s.valid_until_date is not null);

-- Meeting reminder runs logged the time they were created for in the execution log.
update public.crm_sequence_enrollments e
   set anchor_key = to_char((l.detail)::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  from (
    select distinct on (x.enrollment_id) x.enrollment_id, x.detail
      from public.crm_sequence_execution_log x
     where x.action = 'meeting_scheduled_at' and x.detail ~ '^\d{4}-\d{2}-\d{2}T'
     order by x.enrollment_id, x.created_at desc
  ) l
 where l.enrollment_id = e.id
   and e.meeting_id is not null
   and e.anchor_key is null;

-- ── Trigger queue ────────────────────────────────────────────────────────────
alter table public.crm_automation_trigger_queue
  add column if not exists failed_at timestamptz,
  add column if not exists skip_reason text;

alter table public.crm_automation_trigger_queue
  drop constraint if exists crm_automation_trigger_queue_skip_reason_check;
alter table public.crm_automation_trigger_queue
  add constraint crm_automation_trigger_queue_skip_reason_check
  check (skip_reason is null or skip_reason in ('org_inactive', 'premise_changed'));

-- Rows already stuck at the attempt limit are closed out as failed.
update public.crm_automation_trigger_queue
   set failed_at = now(), processed_at = now(), updated_at = now()
 where processed_at is null and attempts >= 5;
