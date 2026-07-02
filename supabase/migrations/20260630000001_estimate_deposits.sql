ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS deposit_required_cents   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_collected_cents  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_method           text CHECK (deposit_method IN ('cash','check','ach','credit_card','stripe','other')),
  ADD COLUMN IF NOT EXISTS deposit_reference        text,
  ADD COLUMN IF NOT EXISTS deposit_notes            text,
  ADD COLUMN IF NOT EXISTS deposit_collected_at     timestamptz;
