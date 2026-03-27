-- Drop FK constraints on asset_id so PM schedules and meters
-- can reference both assets AND vehicles (polymorphic).
ALTER TABLE public.pm_schedules
  DROP CONSTRAINT IF EXISTS pm_schedules_asset_id_fkey;

ALTER TABLE public.meters
  DROP CONSTRAINT IF EXISTS meters_asset_id_fkey;
