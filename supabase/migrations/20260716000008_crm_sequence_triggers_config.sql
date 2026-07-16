-- Per-trigger configuration (e.g. { "days": 7 }) for date-gap automation
-- triggers such as estimate_expiring / estimate_no_response. Mirrors the
-- config jsonb column already on crm_sequence_events.

ALTER TABLE public.crm_sequence_triggers
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;
