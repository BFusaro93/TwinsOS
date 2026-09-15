-- Reconstructed from supabase_migrations.schema_migrations (statements
-- column) on production — this version was applied directly with no
-- matching local file, discovered during the 2026-09-14 migration drift
-- reconciliation (see migration-drift-check.yml).

CREATE OR REPLACE FUNCTION public.is_staff(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = uid AND email = ANY(ARRAY['brandonfusaro@twinslawnservice.com', 'brandon.fusaro93@gmail.com'])
  );
$$;
