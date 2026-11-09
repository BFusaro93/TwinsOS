-- RLS performance: evaluate the org/role helper ONCE per query, not once per scanned row.
--
-- 300 policies (192 tables) on PROD call `org_id = my_org_id()` bare. A STABLE function used in a
-- row filter is re-run for every row the planner scans, and my_org_id() is a SECURITY DEFINER plpgsql
-- function that reads profiles + the impersonation table, ~40us a call. When the planner chooses a
-- sequential scan (any table where the caller's org is a sizeable share of rows) every list query pays
-- that for EVERY ROW IN THE TABLE, other tenants' rows included, so each new tenant makes every other
-- tenant's lists slower. Measured by the 2026-11-08 stress sweep on a 2,200-row work_orders table:
--     SELECT ... FROM work_orders ORDER BY created_at DESC LIMIT 50   (as an org member)
--     bare  my_org_id()           : 92.4 ms, 13,287 buffer hits
--     (SELECT my_org_id())        :  3.3 ms,    625 buffer hits   (same plan, 28x faster)
-- `(SELECT fn())` makes Postgres evaluate it once as an InitPlan. This is the documented Supabase RLS
-- pattern, and the newer policies here (read_only_when_canceled_*, role_write_guard_*) already use it.
--
-- Semantics are identical: these helpers are STABLE, so their value cannot change within a statement.
-- Scope is deliberately narrow: only these four zero-argument scalar helpers, only the `public`
-- schema, only policies that still call them unwrapped. Idempotent (a second run finds nothing).
-- Policy name, command, PERMISSIVE/RESTRICTIVE and roles are untouched (ALTER POLICY keeps them).
DO $$
DECLARE
  r           record;
  new_using   text;
  new_check   text;
  stmt        text;
  altered     integer := 0;
  -- Not preceded by an identifier char or '.', and not already `SELECT my_org_id()`.
  pat CONSTANT text := '(?<![A-Za-z0-9_.])(?<!SELECT )(my_org_id|has_crm_access|my_role|is_client_portal_user)\(\)';
BEGIN
  -- Refuse to run if any of the four were ever redefined as VOLATILE: wrapping would change behaviour.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('my_org_id', 'has_crm_access', 'my_role', 'is_client_portal_user')
       AND p.provolatile = 'v'
  ) THEN
    RAISE EXCEPTION 'A policy helper is VOLATILE; refusing to wrap it in a subselect';
  END IF;

  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
  LOOP
    new_using := CASE WHEN r.qual       IS NULL THEN NULL ELSE regexp_replace(r.qual,       pat, '(SELECT \1())', 'g') END;
    new_check := CASE WHEN r.with_check IS NULL THEN NULL ELSE regexp_replace(r.with_check, pat, '(SELECT \1())', 'g') END;

    IF new_using IS NOT DISTINCT FROM r.qual AND new_check IS NOT DISTINCT FROM r.with_check THEN
      CONTINUE;
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF new_using IS NOT NULL THEN stmt := stmt || ' USING (' || new_using || ')'; END IF;
    IF new_check IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || new_check || ')'; END IF;
    EXECUTE stmt;
    altered := altered + 1;
  END LOOP;

  RAISE NOTICE 'rls_initplan_wrap_org_helpers: rewrote % policies', altered;
END
$$;
