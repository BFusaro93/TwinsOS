-- Staff impersonation, phase 5: lets a staff member list every organization
-- to pick a target for impersonation. Deliberately a narrow RPC (id, name
-- only) rather than a blanket "staff can SELECT * organizations" RLS policy
-- — the organizations table also holds stripe/twilio account identifiers
-- that don't need to be broadly exposed just to populate an org picker.
CREATE OR REPLACE FUNCTION public.list_organizations_for_staff()
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name FROM public.organizations o
  WHERE public.is_staff(auth.uid())
  ORDER BY o.name;
$$;
