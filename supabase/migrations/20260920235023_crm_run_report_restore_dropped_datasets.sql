-- ─────────────────────────────────────────────────────────────────────────────
-- Restore three reporting datasets that a later CREATE OR REPLACE silently
-- dropped from crm_run_report's whitelist.
--
-- History:
--   20260903110000  added 'rpt_contract_service_usage'
--   20260907150000  added 'rpt_crew_drive_time'
--   20260913150000  added 'rpt_upsells'  (via a surgical anchor patch)
--   20260915120500  re-stated v_allowed_datasets in full from a STALE baseline
--                   → all three above were wiped
--   20260918220000  re-stated it again, adding 'rpt_audit_log' but still
--                   missing the three
--
-- Net effect on both databases: the Field Upsells, Crew Drive Time and
-- Contract Service Usage reports (and any custom analysis or dashboard panel
-- over those datasets) fail with "Unknown dataset: …" — verified live against
-- production before writing this.
--
-- This is the same class of regression as the price-adjustment permission
-- check: a whitelist that lives inside a function body is re-stated, not
-- merged, by the next CREATE OR REPLACE. Anyone replacing crm_run_report must
-- carry the FULL list forward — take it from pg_get_functiondef on a live
-- database, never from an older migration file.
--
-- Patches only the whitelist array in whatever body each environment actually
-- has, skips any dataset already present (idempotent), and raises rather than
-- silently doing nothing if the anchor is gone.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_def     text;
  v_anchor  constant text := '''rpt_sales_rep_month''';
  v_missing text[] := array[]::text[];
  v_name    text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'crm_run_report'
  limit 1;

  if v_def is null then
    raise exception 'crm_run_report not found — cannot restore its dataset whitelist';
  end if;

  foreach v_name in array array['rpt_contract_service_usage', 'rpt_crew_drive_time', 'rpt_upsells'] loop
    if position('''' || v_name || '''' in v_def) = 0 then
      v_missing := v_missing || v_name;
    end if;
  end loop;

  if cardinality(v_missing) = 0 then
    return;
  end if;

  if position(v_anchor in v_def) = 0 then
    raise exception
      'crm_run_report whitelist anchor not found — its body has changed; add % to v_allowed_datasets by hand',
      array_to_string(v_missing, ', ');
  end if;

  -- One replace of the single anchor occurrence, appending every missing name.
  v_def := replace(
    v_def,
    v_anchor,
    v_anchor || ', ''' || array_to_string(v_missing, ''', ''') || ''''
  );
  execute v_def;

  raise notice 'crm_run_report: restored %', array_to_string(v_missing, ', ');
end $$;
