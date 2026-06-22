-- Add service date, hours, and men columns to invoice line items
ALTER TABLE public.crm_invoice_line_items
  ADD COLUMN IF NOT EXISTS service_date date,
  ADD COLUMN IF NOT EXISTS hours numeric(8,2),
  ADD COLUMN IF NOT EXISTS men integer;
