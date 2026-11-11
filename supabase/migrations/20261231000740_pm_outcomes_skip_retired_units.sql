-- v_pm_outcomes: an open meter-raised maintenance request for a unit that has
-- since been deleted, disposed or sold no longer counts as an overdue
-- ("not generated") PM unit. 20261231000730 now closes those requests when a
-- unit is retired; this keeps the view right for any that slip through (and
-- matches how the scheduled side already skips retired units). Requests with
-- no unit are unaffected.
-- Only the final meter-request WHERE changes; columns are unchanged so
-- CREATE OR REPLACE VIEW keeps security_invoker. Rewritten from the live
-- definition (same approach as 20261128000100) so it stays correct however
-- many times the view has been replaced.
DO $$
DECLARE
  v_def text;
  v_new text;
  v_anchor constant text := '((r.created_at AT TIME ZONE org_timezone(r.org_id))::date + 7) < org_today(r.org_id)';
BEGIN
  v_def := pg_get_viewdef('public.v_pm_outcomes'::regclass, true);
  IF position('retired_unit_guard' in v_def) > 0 THEN
    RETURN;  -- already applied
  END IF;
  IF position(v_anchor in v_def) = 0 THEN
    RAISE EXCEPTION 'v_pm_outcomes: meter-request due-date filter not found';
  END IF;
  v_new := replace(
    v_def,
    v_anchor,
    v_anchor || ' AND (r.asset_id IS NULL'
      || ' OR EXISTS (SELECT 1 AS retired_unit_guard FROM assets ua WHERE ua.id = r.asset_id AND ua.deleted_at IS NULL AND (ua.status <> ALL (ARRAY[''disposed''::text, ''sold''::text])))'
      || ' OR EXISTS (SELECT 1 FROM vehicles uv WHERE uv.id = r.asset_id AND uv.deleted_at IS NULL AND (uv.status <> ALL (ARRAY[''disposed''::text, ''sold''::text]))))'
  );
  EXECUTE 'CREATE OR REPLACE VIEW public.v_pm_outcomes WITH (security_invoker = on) AS ' || v_new;
END $$;

revoke all on public.v_pm_outcomes from anon;
grant select on public.v_pm_outcomes to authenticated;
