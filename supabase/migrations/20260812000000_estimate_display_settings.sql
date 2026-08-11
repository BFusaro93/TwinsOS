-- Client-facing display controls for estimates (quantities, line prices,
-- line totals, section subtotals, hide-$0 rows/prices) — same convention as
-- tiers_enabled/tier_labels.
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS display_settings jsonb NOT NULL DEFAULT '{
    "showQuantities": true,
    "showLinePrices": true,
    "showLineTotals": true,
    "showSectionSubtotals": true,
    "hideZeroTotals": false,
    "hideZeroPrices": false
  }';
