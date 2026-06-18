-- Snapshot org labor rates onto each project so historical records aren't
-- affected by future rate changes. Editable per project like sales tax.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS labor_rate_cents integer,
  ADD COLUMN IF NOT EXISTS burdened_rate_cents integer;
