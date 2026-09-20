-- ============================================================
-- Stop deriving business dates from the UTC calendar.
--
-- Supabase runs every session with TimeZone = 'UTC', so `current_date` in
-- Postgres is the UTC day, not the day the business is having. Between 8pm
-- Eastern (EDT) and midnight, `current_date` is already TOMORROW. Verified on
-- the live DB at 22:46 America/New_York on 2026-09-18:
--
--   current_date                             -> 2026-09-19
--   (now() at time zone 'America/New_York')  -> 2026-09-18
--
-- So anything dated by `current_date` after 8pm ET lands on the wrong day, and
-- on the evening of the last day of a month it lands in the wrong MONTH —
-- which silently moves revenue between accounting periods.
--
-- The application layer already gets this right: it sends invoice_date /
-- payment_date explicitly, computed with isoNy() (src/lib/reports/ny-date.ts).
-- These DB-side derivations are the paths that bypass it — the column defaults
-- (reached by any insert that omits the column, including MCP/API writes and
-- manual SQL) and create_invoice_from_milestone, which hardcodes current_date
-- rather than taking a date parameter.
--
-- 'America/New_York' matches the constant the app hardcodes (COMPANY_TIME_ZONE
-- in src/lib/utils.ts). There is no per-org timezone column yet; when one
-- lands this is one of the places that has to consult it.
-- ============================================================

alter table public.crm_invoices
  alter column invoice_date set default (now() at time zone 'America/New_York')::date;

alter table public.crm_payments
  alter column payment_date set default (now() at time zone 'America/New_York')::date;

alter table public.project_change_orders
  alter column requested_date set default (now() at time zone 'America/New_York')::date;

-- ============================================================
-- Applied to PROD and TEST on 2026-09-20 -- COLUMN DEFAULTS ONLY.
--
-- This file originally also restated create_invoice_from_milestone() with a
-- hardcoded 'America/New_York'. That restatement has been REMOVED rather than
-- applied, because by the time this ran both databases already carried a newer
-- and strictly better per-org implementation:
--
--   create_invoice_from_milestone -> public.org_today(v_org_id)
--   org_today(uuid)    -> (now() at time zone org_timezone(p_org_id))::date
--   org_timezone(uuid) -> coalesce(organizations.timezone, 'America/New_York')
--
-- org_timezone falls back to exactly the constant this file hardcoded, so the
-- live version does everything this one did and honours a per-org timezone as
-- well. Running the restatement would have thrown that away -- the same
-- guard-loss pattern that cost this repo the price-run permission check.
--
-- The column defaults above still had to be applied: a DEFAULT cannot
-- reference another column, so it cannot call org_today(org_id), and the
-- constant expression is the only option there.
--
-- NOTE: org_today / org_timezone / my_today / my_timezone and
-- organizations.timezone exist on both live databases but have NO migration in
-- this repo -- see the drift entry in TASKS.md. A database rebuilt from
-- migrations alone would not have them.
-- ============================================================
