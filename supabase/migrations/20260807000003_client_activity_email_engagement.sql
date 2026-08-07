-- The Resend webhook (20260807000001) only ever handled email.delivered —
-- every other event type (opened, clicked, bounced, complained) was received
-- and explicitly ignored, since there was nowhere to store them. Email
-- Activity's own stat cards already have "Opened", "Bounced", and "Spam"
-- slots sitting at "—" waiting for exactly this data, so add the columns
-- those need. One timestamp per event (first occurrence), matching the
-- existing delivered_at pattern — not a count, not a full event log.

ALTER TABLE public.client_activity
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz;
