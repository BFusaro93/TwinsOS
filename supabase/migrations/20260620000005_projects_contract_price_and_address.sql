-- Add contract_price, city, state, zip to projects table.
-- These were referenced in application code but never added to the schema.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS contract_price integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS city          text,
  ADD COLUMN IF NOT EXISTS state         text,
  ADD COLUMN IF NOT EXISTS zip           text;
