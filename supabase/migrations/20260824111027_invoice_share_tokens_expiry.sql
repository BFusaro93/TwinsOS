-- invoice_share_tokens.expires_at had no default and nothing ever set it,
-- so every "view your invoice online" link lived forever with no way to
-- revoke a leaked one. Give new tokens a real expiry and backfill existing
-- live tokens instead of abruptly breaking already-sent links.
ALTER TABLE invoice_share_tokens
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '90 days');

UPDATE invoice_share_tokens
  SET expires_at = now() + interval '90 days'
  WHERE expires_at IS NULL;

ALTER TABLE invoice_share_tokens
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
