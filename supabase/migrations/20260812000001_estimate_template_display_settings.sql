-- Templates can pre-set the client-facing display toggles (see
-- 20260812000000_estimate_display_settings.sql) so selecting a template on
-- an estimate applies both its line items and its display settings.
ALTER TABLE estimate_templates
  ADD COLUMN IF NOT EXISTS display_settings jsonb NOT NULL DEFAULT '{
    "showQuantities": true,
    "showLinePrices": true,
    "showLineTotals": true,
    "showSectionSubtotals": true,
    "hideZeroTotals": false,
    "hideZeroPrices": false
  }';
