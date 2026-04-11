-- Monthly financial snapshot data (P&L + cash flow)
CREATE TABLE public.financial_periods (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_month date       NOT NULL,               -- stored as first day of month: YYYY-MM-01
  data        jsonb       NOT NULL DEFAULT '{}',   -- see FinancialPeriodData in hook
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, period_month)
);

ALTER TABLE public.financial_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_financial_periods" ON public.financial_periods
  FOR ALL USING (org_id = public.my_org_id()) WITH CHECK (org_id = public.my_org_id());

-- updated_at trigger
CREATE TRIGGER financial_periods_updated_at
  BEFORE UPDATE ON public.financial_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
