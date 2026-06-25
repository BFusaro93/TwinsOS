-- Add job-level invoice description to crm_jobs.
-- This is the master invoice description for the entire job,
-- not a per-visit override (which lives on crm_job_visits.invoice_description).
ALTER TABLE crm_jobs ADD COLUMN IF NOT EXISTS invoice_description TEXT;
