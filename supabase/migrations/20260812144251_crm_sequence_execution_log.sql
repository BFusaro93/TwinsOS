-- Automation execution audit log — records every meaningful outcome the
-- sequence processor (and the approval-decision route) produces, so there is
-- a persisted answer to "what did this automation actually do": enrollments,
-- emails sent, alerts fired, steps skipped, sequences stopped/completed, and
-- approval decisions. Previously this only existed as an ephemeral JSON
-- response from /api/automations/run — nothing was ever stored.

CREATE TABLE IF NOT EXISTS crm_sequence_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT my_org_id() REFERENCES organizations(id),
  enrollment_id uuid REFERENCES crm_sequence_enrollments(id) ON DELETE CASCADE,
  sequence_id uuid REFERENCES crm_automation_sequences(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id),
  event_id uuid REFERENCES crm_sequence_events(id) ON DELETE SET NULL,
  event_type text,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_sequence_execution_log_org_created_idx
  ON crm_sequence_execution_log (org_id, created_at DESC);

ALTER TABLE crm_sequence_execution_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org isolation" ON crm_sequence_execution_log;
CREATE POLICY "org isolation" ON crm_sequence_execution_log USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
