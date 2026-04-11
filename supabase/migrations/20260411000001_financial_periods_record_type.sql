-- Add record_type to distinguish actuals from budget entries
ALTER TABLE public.financial_periods
  ADD COLUMN IF NOT EXISTS record_type text NOT NULL DEFAULT 'actual'
  CONSTRAINT financial_periods_record_type_check CHECK (record_type IN ('actual', 'budget'));

-- Drop the old unique constraint (org_id, period_month) and replace with
-- (org_id, period_month, record_type) so budget + actual can coexist per month
ALTER TABLE public.financial_periods
  DROP CONSTRAINT IF EXISTS financial_periods_org_id_period_month_key;

ALTER TABLE public.financial_periods
  ADD CONSTRAINT financial_periods_org_id_period_month_record_type_key
  UNIQUE (org_id, period_month, record_type);
