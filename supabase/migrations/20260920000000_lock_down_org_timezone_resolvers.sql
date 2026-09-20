-- ============================================================
-- Fix: the org-timezone resolvers were still anon-callable.
--
-- 20260919030000 tried to lock them down with
--
--   revoke all on function public.org_timezone(uuid) from anon;
--
-- which does nothing, because the EXECUTE privilege anon was using comes from
-- the default grant to PUBLIC, not from a grant to anon. Revoking from a role
-- that never held its own grant leaves the PUBLIC grant intact.
--
-- Why it matters: org_timezone(uuid)/org_today(uuid) are SECURITY DEFINER and
-- take an ARBITRARY org id, so an unauthenticated caller holding the public
-- anon key could read any tenant's timezone — a small cross-tenant leak, but
-- exactly the posture the anon-RPC lockdown was meant to establish. The five
-- RLS helpers (my_org_id, has_crm_access, my_role, my_crew_ids, is_staff) stay
-- anon-callable by design; these are not RLS helpers.
--
-- my_timezone()/my_today() take no arguments and only ever report the caller's
-- own org (anon resolves to the platform default), so they leak nothing — but
-- anon has no use for them either, so they get the same treatment.
-- ============================================================

revoke all on function public.org_timezone(uuid) from public;
revoke all on function public.org_today(uuid)    from public;
revoke all on function public.my_timezone()      from public;
revoke all on function public.my_today()         from public;

grant execute on function public.org_timezone(uuid) to authenticated, service_role;
grant execute on function public.org_today(uuid)    to authenticated, service_role;
grant execute on function public.my_timezone()      to authenticated, service_role;
grant execute on function public.my_today()         to authenticated, service_role;

-- The date-default triggers call org_today(), and a BEFORE ROW trigger runs
-- BEFORE the RLS WITH CHECK that would reject an anon insert. Without this,
-- an anon attempt on one of these tables would fail with "permission denied
-- for function org_today" instead of the row-level-security error it should
-- get — a worse message, and a 500 where a 403 belongs. SECURITY DEFINER is
-- safe here: each function reads organizations.timezone for the row's OWN
-- org_id and sets one date column. No caller input reaches it.
alter function public.set_invoice_date_org_today()    security definer;
alter function public.set_payment_date_org_today()    security definer;
alter function public.set_requested_date_org_today()  security definer;
alter function public.set_estimate_date_org_today()   security definer;
alter function public.crm_jobs_default_date_sold()    security definer;
