-- Correction to 20260807000003: assumed Resend had an "email.complained"
-- event (a convention from other providers like SendGrid), but Resend's
-- actual webhook catalog is delivered/bounced/opened/clicked/sent/scheduled/
-- delivery_delayed/failed — there is no complained event, so complained_at
-- would never have been populated by anything. Drop it and add failed_at for
-- the real "email.failed" event instead (Resend couldn't send the message at
-- all — distinct from "bounced", which is after an attempted delivery).

ALTER TABLE public.client_activity DROP COLUMN IF EXISTS complained_at;
ALTER TABLE public.client_activity ADD COLUMN IF NOT EXISTS failed_at timestamptz;
