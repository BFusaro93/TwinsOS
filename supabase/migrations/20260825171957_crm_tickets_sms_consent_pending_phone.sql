-- Reconciliation: this migration was applied directly to production by a
-- concurrent session without a committed local file (see PR #68 for the
-- recovery process). Reconstructed from production's actual schema.
ALTER TABLE public.crm_tickets
  ADD COLUMN IF NOT EXISTS sms_consent_pending_phone boolean NOT NULL DEFAULT false;
