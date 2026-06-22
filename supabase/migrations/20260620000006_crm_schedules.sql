CREATE TABLE public.crm_schedules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id),
  name         text NOT NULL,
  frequency    text NOT NULL CHECK (frequency IN ('weekly','bi_weekly','every_3_weeks','every_4_weeks','monthly')),
  day_of_week  text NOT NULL CHECK (day_of_week IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  week_pattern text CHECK (week_pattern IN ('even','odd','any')),
  anchor_date  date,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
ALTER TABLE public.crm_schedules ALTER COLUMN org_id SET DEFAULT public.my_org_id();
ALTER TABLE public.crm_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_crm_schedules" ON public.crm_schedules
  FOR ALL USING (org_id = public.my_org_id());
CREATE TRIGGER trg_crm_schedules_updated_at
  BEFORE UPDATE ON public.crm_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
