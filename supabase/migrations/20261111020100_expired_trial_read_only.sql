-- Expired trials are read-only at the database, exactly like canceled orgs.
--
-- The app hard-locks an expired trial out of the shells (TrialExpiredGate) but
-- the DB kept accepting writes from anyone with a session, so a customer could
-- keep using the product through the API / a stale tab after the trial ended.
-- Every org-scoped table already carries RESTRICTIVE insert/update/delete
-- policies keyed on my_org_is_read_only() (20260926190000); widening that one
-- function extends them to expired trials with no per-table change.
--
-- Only an org that is on plan 'trial' WITH a trial_ends_at in the past is
-- affected. A null trial_ends_at is open-ended (the real "Twins Lawn Service"
-- org and the sandbox are in that state — NEVER backfill it), paid plans are
-- not 'trial', and platform-staff orgs are always exempt. Reading is untouched,
-- and billing/subscribe flows use the service role (bypasses RLS), so an
-- expired customer can still upgrade; the plan change clears the condition.
CREATE OR REPLACE FUNCTION public.my_org_is_read_only()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT coalesce((
    SELECT o.plan = 'canceled'
        OR (
          o.plan = 'trial'
          AND o.trial_ends_at IS NOT NULL
          AND o.trial_ends_at <= now()
          AND o.is_platform_staff_org IS NOT TRUE
        )
      FROM public.organizations o
     WHERE o.id = my_org_id()
  ), false);
$$;
REVOKE ALL ON FUNCTION public.my_org_is_read_only() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_org_is_read_only() TO authenticated, service_role;
