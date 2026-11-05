-- Per-service notes on a job, carried from the estimate line item.
--   job_note      -> the crew note for that service's visits
--   invoice_desc  -> that service's invoice line description
--   internal_note -> office-only note (never crew, never invoiced)
alter table public.crm_job_services
  add column if not exists job_note text,
  add column if not exists invoice_desc text,
  add column if not exists internal_note text;
