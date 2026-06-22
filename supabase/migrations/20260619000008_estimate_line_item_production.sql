-- Add Aspire-style production rate fields to estimate line items
alter table estimate_line_items
  add column if not exists unit_type                text,          -- sqft, lf, cuyd, hr, each, acres
  add column if not exists production_rate_sqft_per_hr numeric(10,2); -- from crm_services at time of creation
