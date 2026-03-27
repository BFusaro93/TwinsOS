-- Add missing columns to vehicles table
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS engine_model           text,
  ADD COLUMN IF NOT EXISTS manufacturer           text,
  ADD COLUMN IF NOT EXISTS air_filter_part_number text,
  ADD COLUMN IF NOT EXISTS oil_filter_part_number text,
  ADD COLUMN IF NOT EXISTS spark_plug_part_number text;

-- Drop the FK constraint on asset_parts.asset_id so it can reference
-- both assets and vehicles (polymorphic relationship).
-- Referential integrity is maintained at the application layer.
ALTER TABLE public.asset_parts
  DROP CONSTRAINT IF EXISTS asset_parts_asset_id_fkey;
