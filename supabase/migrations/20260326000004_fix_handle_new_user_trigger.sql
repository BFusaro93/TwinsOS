-- Fix handle_new_user to gracefully skip profile creation when org_id
-- is not provided in user metadata (e.g. users created via the dashboard).
-- The profile will be created manually or via the invite flow.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
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
