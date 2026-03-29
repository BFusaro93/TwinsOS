-- Add location field to parts table (shared concept with assets/vehicles)
ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS location text;
