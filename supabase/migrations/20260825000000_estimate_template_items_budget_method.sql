-- estimate_template_items never carried budget_method / production_rate_sqft_per_hr,
-- unlike estimate_line_items and crm_job_services which both snapshot these from the
-- service when the row is created. Without them, applying a template in
-- NewEstimateDialog had no snapshot to read and hardcoded budget_method to 'manual'
-- for every line, silently discarding a service's production-rate budgeting for any
-- estimate created from a template.

alter table public.estimate_template_items
  add column if not exists budget_method text not null default 'manual'
    check (budget_method in ('manual', 'production_rate')),
  add column if not exists production_rate_sqft_per_hr numeric(10,2);
