-- Add a CHECK constraint on crm_services.unit matching the UI's actual UNITS
-- list (src/components/crm/services/ServiceDialog.tsx). No constraint currently
-- exists live on either environment (the one in 20260617000003_crm_jobs.sql's
-- CREATE TABLE was narrower — 'visit','sqft','hour','lb','yard' — and doesn't
-- match what's actually enforced today; existing data already only uses values
-- from the broader UI list, so no backfill is needed).

ALTER TABLE crm_services
  ADD CONSTRAINT crm_services_unit_check
  CHECK (unit IN ('visit', 'sqft', 'lf', 'cuyd', 'acres', 'hr', 'each', 'lb', 'gal'));
