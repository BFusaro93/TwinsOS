-- ─────────────────────────────────────────────────────────────────────────────
-- Close an anon-EXECUTE gap left by this week's per-org-timezone work.
--
-- 20260913160000 revoked anon EXECUTE across the SECURITY DEFINER surface,
-- leaving only the RLS helper functions callable, and 20260920000000 did the
-- same for org_today()/org_timezone(). The BEFORE-INSERT trigger functions
-- added alongside them were created SECURITY DEFINER but never had their
-- default PUBLIC grant revoked, so they are still reachable at
-- /rest/v1/rpc/<name> by anon and authenticated:
--
--   crm_jobs_default_date_sold, set_estimate_date_org_today,
--   set_invoice_date_org_today, set_payment_date_org_today,
--   set_requested_date_org_today
--
-- Each returns `trigger`, so a direct RPC call errors with "trigger functions
-- can only be called as triggers" rather than doing anything — this closes a
-- policy gap and quiets the advisor, it is not fixing a live exploit.
--
-- Safe for the triggers themselves: PostgreSQL checks EXECUTE on a trigger
-- function at CREATE TRIGGER time, not when the trigger fires, so revoking
-- here does not affect inserts on crm_jobs / estimates / crm_invoices /
-- crm_payments / requisitions.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'crm_jobs_default_date_sold',
    'set_estimate_date_org_today',
    'set_invoice_date_org_today',
    'set_payment_date_org_today',
    'set_requested_date_org_today'
  ] loop
    if to_regprocedure('public.' || v_fn || '()') is not null then
      execute format('revoke execute on function public.%I() from public, anon, authenticated', v_fn);
    end if;
  end loop;
end $$;
