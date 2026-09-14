-- Replace the hardcoded-email-array is_staff() (20260831130000) with an
-- org-membership check: Landscapt is becoming its own company, so its real
-- organization IS the staff org — every member of the org flagged
-- is_platform_staff_org is trusted staff, full stop (per Brandon's decision:
-- every member, not a narrower role check). Onboarding a new support hire is
-- then just "invite them into the Landscapt org" — the app's existing invite
-- flow, zero migrations/deploys needed per person.
--
-- Brandon creates the actual "Landscapt" org himself through the normal
-- signup flow (account/org creation is a boundary Claude doesn't cross) —
-- this migration only adds the flag and points is_staff() at it. A follow-up
-- one-line UPDATE (run after the org exists) sets the flag once its real id
-- is known; see the plan/notes for that step.

ALTER TABLE organizations
  ADD COLUMN is_platform_staff_org boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_staff(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.organizations o ON o.id = p.org_id
    WHERE p.id = uid AND o.is_platform_staff_org = true
  );
$$;
