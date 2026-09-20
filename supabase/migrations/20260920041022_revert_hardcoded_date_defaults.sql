-- 20260919020000 set hardcoded 'America/New_York' defaults on these three
-- columns. 20260919070000_org_timezone.sql drops them again and replaces them
-- with BEFORE INSERT triggers calling public.org_today(new.org_id), because a
-- column DEFAULT cannot reference another column and so can never be per-org.
--
-- Those defaults were re-applied to production and test by hand on 2026-09-20
-- from a branch cut before the per-org work landed. A column DEFAULT is
-- evaluated before a BEFORE ROW trigger fires, so new.<col> was never null, the
-- trigger's `is null` guard never passed, and every org was silently pinned to
-- Eastern. This is the revert, committed so the ledger and the repo agree.
--
-- On a database built from migrations in order this is a no-op: 20260919070000
-- has already dropped the defaults by the time it runs, and `drop default` on a
-- column with no default succeeds.
alter table public.crm_invoices          alter column invoice_date   drop default;
alter table public.crm_payments          alter column payment_date   drop default;
alter table public.project_change_orders alter column requested_date drop default;
