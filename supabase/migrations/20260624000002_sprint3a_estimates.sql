-- Sprint 3a: Estimates gap fill
-- Adds per-line-item notes, won/lost reason, and service call script notes

-- 1. Per-line-item notes on estimate_line_items
ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS estimate_desc  text,
  ADD COLUMN IF NOT EXISTS job_note       text,
  ADD COLUMN IF NOT EXISTS invoice_desc   text,
  ADD COLUMN IF NOT EXISTS internal_note  text;

-- 2. Won/Lost reason on estimates
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS reason text;

-- 3. Call script notes on crm_services
ALTER TABLE crm_services
  ADD COLUMN IF NOT EXISTS call_script_notes text;
