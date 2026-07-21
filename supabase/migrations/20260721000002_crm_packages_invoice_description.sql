-- crm_services has a separate invoice_description distinct from its internal
-- `description` and estimate-facing description_on_estimate (see
-- 20260619000009_crm_service_settings.sql) — Packages had the same gap: no
-- way to set invoice-facing wording independent of the internal admin notes.
alter table crm_packages
  add column if not exists invoice_description text;

-- monthly_amount_cents/season_months were a "Billing" section on the package
-- edit form that never actually fed any job/invoice pricing (packages price
-- per-visit via the job's own services grid) — the columns are left in place
-- since dropping populated columns isn't worth the risk, but the dead UI
-- that edited them has been removed.
