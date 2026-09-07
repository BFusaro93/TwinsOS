-- Backfill: crm_reports was originally created out-of-band (directly on
-- PROD, never captured as a migration), which is invisible on every real
-- environment (they're all built incrementally onto an already-existing
-- schema) but breaks a genuine from-scratch replay -- 20260617000008
-- (crm_reports_metrics) ALTERs this table before any migration creates it.
-- IF NOT EXISTS everywhere so this is a no-op on PROD/TEST, which already
-- have the table. No policy is created here -- see
-- 20260906220000_restrict_crm_reports_to_staff.sql for that, kept separate
-- so the two migrations don't race to define the same policy.
create table if not exists public.crm_reports (
  id text primary key default 'latest',
  html_content text not null,
  updated_at timestamptz default now()
);

alter table public.crm_reports enable row level security;
