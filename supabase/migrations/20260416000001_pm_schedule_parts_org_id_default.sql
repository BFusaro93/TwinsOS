-- pm_schedule_parts was missing from the org_id defaults pass.
-- Without this, org_id is NULL on insert and RLS rejects every write.
ALTER TABLE public.pm_schedule_parts ALTER COLUMN org_id SET DEFAULT public.my_org_id();
