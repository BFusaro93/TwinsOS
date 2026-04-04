-- AvB × Gusto crew hours weekly data
CREATE TABLE public.avb_weeks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  week_end    date        NOT NULL,
  data        jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, week_end)
);

ALTER TABLE public.avb_weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_avb_weeks" ON public.avb_weeks
  FOR ALL USING (org_id = public.my_org_id()) WITH CHECK (org_id = public.my_org_id());
