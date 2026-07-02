-- Tier assignment on line items (null = included in all tiers)
ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS tier text CHECK (tier IN ('basic', 'standard', 'premium'));

-- Tier config on estimates (labels + enabled flag)
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS tiers_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tier_labels   jsonb NOT NULL DEFAULT '{"basic":"Basic","standard":"Standard","premium":"Premium"}';
