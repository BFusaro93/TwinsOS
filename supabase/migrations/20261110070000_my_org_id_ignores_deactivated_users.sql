-- A deactivated user keeps working until their access token expires.
--
-- /api/users/[userId]/deactivate bans the auth user, which stops sign-in and
-- token REFRESH, but a JWT that was already issued stays valid for the rest of
-- its lifetime (up to an hour). RLS on every org table keys on my_org_id(),
-- which only looked at profiles.org_id, so a fired employee whose admin just
-- clicked Deactivate could still read and write the whole org until the token
-- lapsed. my_org_id() now returns NULL for a profile whose status is
-- 'inactive', so every org-scoped policy (org_id = my_org_id()) stops matching
-- immediately. Only the deactivate route ever sets 'inactive'; reactivation
-- sets it back to 'active' and unbans, so nothing legitimate is affected.
--
-- Body is otherwise identical to the existing definition (staff impersonation
-- override first, then the caller's own profile).
CREATE OR REPLACE FUNCTION public.my_org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  RETURN (
    SELECT org_id FROM public.profiles
    WHERE id = auth.uid()
      AND status IS DISTINCT FROM 'inactive'
  );
END;
$function$;

-- A deactivated platform-staff user must not keep staff powers (impersonation
-- override in my_org_id(), staff-only policies) while their token lingers.
CREATE OR REPLACE FUNCTION public.is_staff(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.organizations o ON o.id = p.org_id
    WHERE p.id = uid
      AND p.status IS DISTINCT FROM 'inactive'
      AND o.is_platform_staff_org = true
  );
$function$;
