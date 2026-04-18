-- Allow a third record_type value "ytd_actual" for storing the QBO YTD column
-- directly instead of summing monthly actuals (which drifts when lines are
-- reclassed to the balance sheet after month close).
ALTER TABLE financial_periods
  DROP CONSTRAINT IF EXISTS financial_periods_record_type_check;

ALTER TABLE financial_periods
  ADD CONSTRAINT financial_periods_record_type_check
  CHECK (record_type IN ('actual', 'budget', 'ytd_actual'));
