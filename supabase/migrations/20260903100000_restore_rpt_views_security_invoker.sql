-- SECURITY FIX: restore security_invoker on report views that lost it.
--
-- 20260825134610_report_views_sales_rep_target_employees.sql re-created six
-- rpt_* views with a plain `create or replace view` (no
-- `with (security_invoker = on)`). CREATE OR REPLACE VIEW replaces the view's
-- reloptions, so the option originally set in 20260706233504 was silently
-- cleared. rpt_products was fixed in 20260824130000 but that migration was
-- never applied to PROD. Without security_invoker these views run as their
-- owner (postgres) and bypass base-table RLS — any authenticated user could
-- read every org's clients, invoices, estimates, contracts, and products via
-- crm_run_report (confirmed 2026-09-03 via pg_class.reloptions on PROD).
--
-- Idempotent: ALTER VIEW ... SET is safe to re-run.
alter view public.rpt_client_contacts     set (security_invoker = on);
alter view public.rpt_clients             set (security_invoker = on);
alter view public.rpt_contracts           set (security_invoker = on);
alter view public.rpt_estimate_line_items set (security_invoker = on);
alter view public.rpt_estimates           set (security_invoker = on);
alter view public.rpt_invoices            set (security_invoker = on);
alter view public.rpt_products            set (security_invoker = on);
