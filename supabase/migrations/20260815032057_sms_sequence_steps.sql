-- SMS support for CRM sequence automations (text_message event type) and its
-- approval-queue mirror of the existing email require_approval flow.

-- 1. client_activity needs an 'sms' activity_type alongside 'email'.
-- NOTE: prod's live constraint has already grown beyond the original
-- migration file (adds 'ticket','job','crew_note') — this list is a
-- superset of prod's current live constraint plus 'sms', not just the
-- original file's list, so this doesn't silently narrow prod.
ALTER TABLE client_activity DROP CONSTRAINT IF EXISTS client_activity_activity_type_check;
ALTER TABLE client_activity ADD CONSTRAINT client_activity_activity_type_check
  CHECK (activity_type IN (
    'note','call','email','sms','invoice','payment',
    'job_visit','estimate','contract','automation',
    'ticket','job','crew_note'
  ));

-- 2. crm_sequence_step_approvals gains a channel discriminator so a pending
--    SMS step can queue in the same table as email steps. to_email/subject
--    stay required for email rows; sms rows use to_phone/body_text instead.
ALTER TABLE crm_sequence_step_approvals
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms')),
  ADD COLUMN IF NOT EXISTS to_phone text,
  ADD COLUMN IF NOT EXISTS body_text text;

ALTER TABLE crm_sequence_step_approvals ALTER COLUMN to_email DROP NOT NULL;
ALTER TABLE crm_sequence_step_approvals ALTER COLUMN subject DROP NOT NULL;

ALTER TABLE crm_sequence_step_approvals DROP CONSTRAINT IF EXISTS crm_sequence_step_approvals_channel_fields_check;
ALTER TABLE crm_sequence_step_approvals ADD CONSTRAINT crm_sequence_step_approvals_channel_fields_check
  CHECK (
    (channel = 'email' AND to_email IS NOT NULL AND subject IS NOT NULL)
    OR (channel = 'sms' AND to_phone IS NOT NULL AND body_text IS NOT NULL)
  );
