-- Staff impersonation, phase 1: lets an internal staff member (Brandon) open
-- a time-limited, fully read/write session inside a customer org's data to
-- help with setup (schedules, jobs, etc.), without weakening tenant
-- isolation for anyone else. See supabase/migrations/20260325000000_initial_schema.sql
-- for the untouched original my_org_id() this replaces.
--
-- Design: my_org_id() — the function ~296 of this app's RLS policies call to
-- decide "which org can this request see" — checks for an active
-- impersonation grant first, falling back to the real profiles lookup
-- otherwise. Every policy that already calls my_org_id() gets impersonation
-- for free; the ~74 tables that inline the org_id subquery instead are
-- converted in a follow-up migration (they don't respect impersonation until
-- then). profiles.org_id itself is never touched, so staff never appear as a
-- member of the target org in member lists/dropdowns/notifications.

-- SECURITY DEFINER to read auth.users, same pattern as
-- get_auth_user_id_by_email() in 20260825000010_get_auth_user_id_by_email_rpc.sql.
-- Deliberately NOT revoked from `authenticated` — my_org_id() (itself
-- SECURITY DEFINER, called constantly during RLS evaluation as the
-- authenticated role) needs to call this internally.
-- Both emails are Brandon: brandonfusaro@twinslawnservice.com on prod,
-- brandon.fusaro93@gmail.com on the test project (see
-- project_test_project_admin_org memory) — same function/migration is
-- applied to both environments, and each only ever matches its own
-- environment's auth.users row.
CREATE OR REPLACE FUNCTION public.is_staff(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = uid AND email = ANY(ARRAY['brandonfusaro@twinslawnservice.com', 'brandon.fusaro93@gmail.com'])
  );
$$;

-- This table IS the audit log (who, which org, when, why) — no separate
-- audit table. Self-expiring: my_org_id() checks expires_at on every call,
-- so an expired grant stops working immediately with no cleanup job needed.
CREATE TABLE staff_impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES profiles(id),
  target_org_id uuid NOT NULL REFERENCES organizations(id),
  reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  ended_at timestamptz
);

ALTER TABLE staff_impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Staff can only see/manage their own sessions. Not staff -> zero access,
-- since is_staff() gates both sides and there's no other policy on this table.
CREATE POLICY "staff manage own impersonation sessions" ON staff_impersonation_sessions
  USING (staff_user_id = auth.uid() AND public.is_staff(auth.uid()))
  WITH CHECK (staff_user_id = auth.uid() AND public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.my_org_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  active_target_org uuid;
BEGIN
  IF public.is_staff(auth.uid()) THEN
    SELECT target_org_id INTO active_target_org
    FROM public.staff_impersonation_sessions
    WHERE staff_user_id = auth.uid()
      AND ended_at IS NULL
      AND expires_at > now()
    ORDER BY started_at DESC
    LIMIT 1;

    IF active_target_org IS NOT NULL THEN
      RETURN active_target_org;
    END IF;
  END IF;

  RETURN (SELECT org_id FROM public.profiles WHERE id = auth.uid());
END;
$$;
