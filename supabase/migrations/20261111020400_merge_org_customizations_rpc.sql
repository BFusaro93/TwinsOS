-- organizations.customizations is a shared jsonb bag (notification recipients,
-- Maps key, reply-to, home shortcuts, estimate display, ...). useUpdateOrgSettings
-- used to read it, merge in the browser, and write the WHOLE object back, so two
-- tabs (or two settings pages) saving at once lost whichever keys the slower
-- writer's stale read didn't contain.
--
-- merge_org_customizations() does the merge in ONE UPDATE (`customizations ||
-- p_changes`): Postgres row-locks the organization for the statement, so
-- concurrent saves serialize and each only touches the top-level keys it sends.
-- A key whose value is JSON null is stored as null, same as before.
--
-- SECURITY INVOKER on purpose: the caller's RLS still decides who may update
-- the org (settings_permission_update_org) and the RESTRICTIVE
-- read_only_when_canceled_upd policy still blocks canceled/expired orgs. The
-- org is my_org_id() (session, honors impersonation) — never a parameter. It
-- returns false when RLS filtered the row out so the caller can raise the same
-- "blocked" error the plain update path does.
CREATE OR REPLACE FUNCTION public.merge_org_customizations(p_changes jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN
    RAISE EXCEPTION 'p_changes must be a JSON object';
  END IF;

  UPDATE public.organizations
     SET customizations = coalesce(customizations, '{}'::jsonb) || p_changes
   WHERE id = public.my_org_id();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_org_customizations(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_org_customizations(jsonb) TO authenticated, service_role;
