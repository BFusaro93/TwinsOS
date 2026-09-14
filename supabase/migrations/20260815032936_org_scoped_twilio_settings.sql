-- Per-org Twilio identity, so the future move to per-tenant Twilio
-- subaccounts (each licensed org gets its own number + A2P 10DLC
-- registration) is a data migration, not a code rewrite.
--
-- Today every org is null here and sendClientSms() falls back to the
-- platform-wide TWILIO_ACCOUNT_SID/TWILIO_MESSAGING_SERVICE_SID env vars —
-- one shared Twilio account for all tenants. When an org gets its own
-- subaccount later, populate these two columns for that org and its sends
-- switch over with no code change.
--
-- twilio_auth_token is intentionally NOT stored here — a per-org auth token
-- is a real secret and needs encrypted-at-rest storage (e.g. Supabase Vault),
-- which this migration doesn't set up. Until that lands, per-org overrides
-- only work if the org's subaccount shares the platform's auth token (true
-- for Twilio subaccounts created under the master account), which is a
-- reasonable interim step before full credential isolation.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS twilio_account_sid text,
  ADD COLUMN IF NOT EXISTS twilio_messaging_service_sid text;
