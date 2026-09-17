-- BUG FIX: a staff member's own profile row became unreadable while they had
-- an active impersonation session running (Sentry: "failed to load profile
-- for current user" at /equipt/home, from use-current-user.ts syncFromUserId).
--
-- Root cause: my_org_id() (supabase/migrations/20260831130000_staff_impersonation_foundation.sql)
-- returns the impersonated org's id for staff with an active grant, so
-- ~296 policies calling my_org_id() transparently scope to the target org.
-- But staff.profiles.org_id is deliberately NEVER changed to the target org
-- (per that migration's comment: "staff never appear as a member of the
-- target org"). The SELECT policy on profiles compares the row's real
-- org_id against my_org_id() — which, mid-impersonation, is the *target*
-- org, not the staff member's real one. Own-row org_id != impersonated
-- org_id, so RLS silently returns zero rows and the client's
-- `.eq("id", userId).single()` errors out.
--
-- Fix: a user can always read their own profile row, impersonation or not —
-- this is no more permissive than the existing users_update_own_profile
-- policy (`USING (id = auth.uid())`, no org_id check at all). Adding the
-- `OR id = auth.uid()` clause here just makes SELECT consistent with that.
DROP POLICY IF EXISTS "users_read_org_profiles" ON public.profiles;

CREATE POLICY "users_read_org_profiles" ON public.profiles
  FOR SELECT USING (
    org_id = public.my_org_id()
    OR id = auth.uid()
  );
