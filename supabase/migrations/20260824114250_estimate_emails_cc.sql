ALTER TABLE estimate_emails
  ADD COLUMN IF NOT EXISTS cc_emails text[] NOT NULL DEFAULT '{}';
