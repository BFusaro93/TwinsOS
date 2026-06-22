-- Add season start/end (format: 'MM-DD') to crm_schedules
ALTER TABLE public.crm_schedules
  ADD COLUMN IF NOT EXISTS season_start text,  -- e.g. '04-01'
  ADD COLUMN IF NOT EXISTS season_end   text;  -- e.g. '11-30'
