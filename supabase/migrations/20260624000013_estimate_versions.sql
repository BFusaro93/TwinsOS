CREATE TABLE IF NOT EXISTS estimate_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id),
  estimate_id    uuid NOT NULL REFERENCES estimates(id),
  version_number integer NOT NULL DEFAULT 1,
  sent_to_email  text,
  snapshot       jsonb NOT NULL,  -- full estimate + line items at time of send
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS estimate_versions_estimate_idx ON estimate_versions(estimate_id);

ALTER TABLE estimate_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read estimate versions"
  ON estimate_versions FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
