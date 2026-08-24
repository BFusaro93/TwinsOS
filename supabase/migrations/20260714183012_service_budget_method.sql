-- Explicit budget-method toggle for services and estimate line items.
-- Previously the choice between "manual budget rate/hours" (Service Autopilot
-- style) and "production rate" (Aspire style, sq ft per man-hour) was inferred
-- implicitly from whether production_rate_sqft_per_hr was set. This makes it
-- an explicit, user-controlled field so a service is deliberately configured
-- one way or the other.

ALTER TABLE crm_services
  ADD COLUMN IF NOT EXISTS budget_method text NOT NULL DEFAULT 'manual'
    CHECK (budget_method IN ('manual', 'production_rate'));

UPDATE crm_services
  SET budget_method = 'production_rate'
  WHERE production_rate_sqft_per_hr IS NOT NULL AND production_rate_sqft_per_hr > 0;

ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS budget_method text NOT NULL DEFAULT 'manual'
    CHECK (budget_method IN ('manual', 'production_rate'));

UPDATE estimate_line_items
  SET budget_method = 'production_rate'
  WHERE production_rate_sqft_per_hr IS NOT NULL AND production_rate_sqft_per_hr > 0;
