-- Sprint 3c: View My Proposal portal + email sending

-- ── 1. Share tokens ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_share_tokens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id),
  estimate_id       uuid NOT NULL REFERENCES estimates(id),
  token             uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at        timestamptz,
  accepted_at       timestamptz,
  accepted_by_name  text,
  signature_data    text,       -- base64 SVG/PNG from signature pad
  ip_address        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS estimate_share_tokens_token_idx ON estimate_share_tokens(token);
CREATE INDEX IF NOT EXISTS estimate_share_tokens_estimate_idx ON estimate_share_tokens(estimate_id);

ALTER TABLE estimate_share_tokens ENABLE ROW LEVEL SECURITY;

-- Authed users in the same org can read/insert/update their tokens
CREATE POLICY "org members manage share tokens"
  ON estimate_share_tokens
  FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── 2. Email log ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_emails (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id),
  estimate_id  uuid NOT NULL REFERENCES estimates(id),
  to_email     text NOT NULL,
  to_name      text,
  subject      text NOT NULL,
  body_html    text NOT NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  resend_id    text,             -- ID returned by Resend for tracking
  email_type   text NOT NULL DEFAULT 'estimate'  -- 'estimate' | 'confirmation'
);

CREATE INDEX IF NOT EXISTS estimate_emails_estimate_idx ON estimate_emails(estimate_id);

ALTER TABLE estimate_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read email log"
  ON estimate_emails
  FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── 3. Email templates ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_email_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id),
  name         text NOT NULL,
  subject      text NOT NULL,
  body_html    text NOT NULL,
  template_type text NOT NULL DEFAULT 'estimate',  -- 'estimate' | 'confirmation' | 'invoice'
  is_default   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS crm_email_templates_org_idx ON crm_email_templates(org_id) WHERE deleted_at IS NULL;

ALTER TABLE crm_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members manage email templates"
  ON crm_email_templates
  FOR ALL
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Seed a default estimate email template (runs once per org on first use via app logic)
-- No seed here since org_id is unknown at migration time
