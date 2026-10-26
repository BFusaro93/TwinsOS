-- Equipment can now be marked "sold" as well as "disposed". Both are retired
-- statuses: the unit leaves the active fleet, drops out of pickers, PM
-- compliance and uptime. Sold is distinct so sale vs scrap can be reported.

DO $$
DECLARE
  r record;
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assets', 'vehicles'] LOOP
    FOR r IN
      SELECT c.conname
        FROM pg_constraint c
       WHERE c.conrelid = ('public.' || t)::regclass
         AND c.contype = 'c'
         AND pg_get_constraintdef(c.oid) ILIKE '%disposed%'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, r.conname);
    END LOOP;
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (status IN (''active'', ''inactive'', ''in_shop'', ''out_of_service'', ''disposed'', ''sold''))',
      t, t || '_status_check'
    );
  END LOOP;
END $$;

-- v_pm_outcomes excludes retired units by name; extend it to cover "sold".
-- Rewritten from the live definition so it stays correct however many times
-- the view has been replaced.
DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_viewdef('public.v_pm_outcomes'::regclass, true);
  v_new := replace(v_def, '<> ''disposed''::text', '<> ALL (ARRAY[''disposed''::text, ''sold''::text])');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'v_pm_outcomes: no disposed filter found to extend';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_pm_outcomes WITH (security_invoker = on) AS ' || v_new;
END $$;
