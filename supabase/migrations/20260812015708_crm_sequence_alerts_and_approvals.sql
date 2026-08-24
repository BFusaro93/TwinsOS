-- Sequence "alert" step recipients + email-step approval queue.
--
-- alert steps previously had nowhere to send to (no recipient column at all —
-- recipients live in crm_sequence_events.config jsonb, no schema change
-- needed there). What IS new:
--   1. crm_sequence_enrollments.awaiting_approval — set while an email step
--      configured with require_approval is waiting on a human decision, so
--      the processor's polling query can skip it instead of re-queuing the
--      same approval every run.
--   2. crm_sequence_step_approvals — the approval queue itself: one pending
--      row per (enrollment, event) with the fully-resolved email content, so
--      approving/rejecting doesn't need to re-run merge-tag resolution.

ALTER TABLE crm_sequence_enrollments
  ADD COLUMN IF NOT EXISTS awaiting_approval bool NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS crm_sequence_step_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT my_org_id() REFERENCES organizations(id),
  enrollment_id uuid NOT NULL REFERENCES crm_sequence_enrollments(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES crm_sequence_events(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES crm_automation_sequences(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id),
  estimate_id uuid REFERENCES estimates(id),
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  body_html text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid REFERENCES profiles(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one pending approval per enrollment+event at a time — the processor
-- checks awaiting_approval before creating one, this is the DB-level backstop.
CREATE UNIQUE INDEX IF NOT EXISTS crm_sequence_step_approvals_pending_unique
  ON crm_sequence_step_approvals (enrollment_id, event_id)
  WHERE status = 'pending';

ALTER TABLE crm_sequence_step_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org isolation" ON crm_sequence_step_approvals;
CREATE POLICY "org isolation" ON crm_sequence_step_approvals USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
DROP TRIGGER IF EXISTS set_updated_at ON crm_sequence_step_approvals;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm_sequence_step_approvals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
