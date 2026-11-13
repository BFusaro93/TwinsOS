-- Snow small tools: hourly depth ranges, job-level invoice terms, invoice time on lines.

-- 1. Depth ranges can bill hourly. For an hourly range rate_cents is the HOURLY rate
--    (max_inches may be null = open-ended "all-inclusive" top range) and
--    budgeted_hours is the planned on-site time (informational).
alter table crm_snow_rate_tiers
  add column if not exists bill_as text not null default 'flat',
  add column if not exists budgeted_hours numeric;

alter table crm_snow_rate_tiers drop constraint if exists crm_snow_rate_tiers_bill_as_check;
alter table crm_snow_rate_tiers
  add constraint crm_snow_rate_tiers_bill_as_check check (bill_as in ('flat', 'hourly'));

alter table crm_snow_rate_tiers drop constraint if exists crm_snow_rate_tiers_rate_check;
alter table crm_snow_rate_tiers
  add constraint crm_snow_rate_tiers_rate_check check (
    (bill_as = 'flat' and (
      (max_inches is not null and rate_cents is not null) or
      (max_inches is null and rate_per_inch_cents is not null)
    )) or
    (bill_as = 'hourly' and rate_cents is not null)
  );

-- 2. Job-level invoice terms override (null = use the client's default_terms).
alter table crm_jobs add column if not exists invoice_terms text;
alter table crm_jobs drop constraint if exists crm_jobs_invoice_terms_check;
alter table crm_jobs
  add constraint crm_jobs_invoice_terms_check check (
    invoice_terms is null or invoice_terms in
      ('due_on_receipt', 'net_10', 'net_15', 'net_30', 'net_45', 'net_60', 'net_90')
  );

-- 3. Per-service option: append the visit's start–end times to snow invoice lines.
alter table crm_services add column if not exists invoice_time_on_lines boolean not null default false;
