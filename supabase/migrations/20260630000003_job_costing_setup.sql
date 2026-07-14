ALTER TABLE crm_employees
  ADD COLUMN IF NOT EXISTS labor_burden_cents_per_hour integer NOT NULL DEFAULT 0;

ALTER TABLE crm_services
  ADD COLUMN IF NOT EXISTS target_rate_cents_per_hr            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_rate_with_drive_cents_per_hr integer NOT NULL DEFAULT 0;
