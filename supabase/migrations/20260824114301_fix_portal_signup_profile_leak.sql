-- Portal customers who accept a client-portal invite (src/app/api/portal/register/route.ts)
-- are created via supabase.auth.admin.createUser() with `org_id` in user_metadata
-- (needed so client_portal_users can be linked to the right org). But
-- handle_new_user() only skipped profile creation when org_id was ABSENT,
-- so every portal signup also silently got a `profiles` row with role
-- 'viewer' — granting them full RLS-level read/write access to the org's
-- CRM/CMMS data, which portal customers must never have. Skip profile
-- creation for any signup flagged `portal: true` in its metadata,
-- regardless of whether org_id is present.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Client-portal signups must never get a staff profile.
  IF (NEW.raw_user_meta_data ->> 'portal') = 'true' THEN
    RETURN NEW;
  END IF;

  -- Skip profile creation if no org_id provided (manual/dashboard user setup)
  IF (NEW.raw_user_meta_data ->> 'org_id') IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, org_id, name, email, role, status)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data ->> 'org_id')::uuid,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'viewer'),
    'active'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Remediate the one account that already leaked through (the portal test
-- customer, test@twinslawnservice.com): null out its FK references so the
-- historical comment it left keeps its text/author_name, then remove the
-- bogus staff profile so it loses CRM/CMMS RLS access. Its client_portal_users
-- row is untouched — portal login keeps working.
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT p.id INTO v_id
  FROM public.profiles p
  JOIN public.client_portal_users cpu ON cpu.user_id = p.id
  WHERE p.email = 'test@twinslawnservice.com';

  IF v_id IS NOT NULL THEN
    UPDATE public.comments SET author_id = NULL WHERE author_id = v_id;
    UPDATE public.comments SET created_by = NULL WHERE created_by = v_id;
    DELETE FROM public.profiles WHERE id = v_id;
  END IF;
END $$;
