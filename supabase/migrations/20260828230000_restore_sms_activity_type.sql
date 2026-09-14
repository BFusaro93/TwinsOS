-- Restores 'sms' and 'crew_note' to client_activity.activity_type's CHECK
-- constraint. 20260815032057_sms_sequence_steps.sql added them (needed for
-- the SMS feature's client_activity inserts), but
-- 20260824111010_client_activity_ticket_job_types.sql — written later from
-- a stale baseline that predated the SMS work — DROP+ADD'd the same
-- constraint using only the original 9 values plus ticket/job, silently
-- reverting the sms/crew_note addition. Confirmed live on both prod and
-- test: neither had 'sms' in the constraint despite the SMS feature having
-- shipped weeks earlier, which is why every SMS activity-log insert with a
-- clientId has been failing (compounding the separate ref_id/uuid bug fixed
-- in 20260828220000).
ALTER TABLE client_activity DROP CONSTRAINT IF EXISTS client_activity_activity_type_check;
ALTER TABLE client_activity ADD CONSTRAINT client_activity_activity_type_check
  CHECK (activity_type IN (
    'note','call','email','sms','invoice','payment',
    'job_visit','estimate','contract','automation',
    'ticket','job','crew_note'
  ));
