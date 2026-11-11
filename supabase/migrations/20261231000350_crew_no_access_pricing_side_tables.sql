-- Crew logins: no access to the remaining job-pricing side tables.
--
-- Found while closing the crew price-read residual (20261231000330/0310): a
-- crew login (profiles.role = 'crew') could still read — and, for most of
-- these, write — tables that carry job or catalog pricing, because their RLS
-- is org-only (+ has_crm_access(), which whitelists crew):
--
--   crm_price_adjustments / crm_price_adjustment_lines  bulk price-change runs;
--       each line is a job service's old and new rate (ALL: org-only)
--   crm_contracts               monthly contract amounts (SELECT: org + crm access)
--   crm_package_services        package default rates (ALL: org-only)
--   estimate_line_item_equipment / estimate_line_item_subitems
--       estimate pricing and costs; estimates themselves were already closed
--       to crew (20260824114014), their child tables were not (ALL: org-only)
--
-- Nothing a crew session runs touches these: verified against the crew pages,
-- crew hooks, every /api/crm/crew route (contracts are only read by the visit
-- completion side effects, which use the service client), the triggers that
-- fire on crew writes, and the rpt_* views a crew dashboard can run
-- (rpt_contracts / rpt_contract_service_usage are dataset-gated by report
-- permissions a crew login never has). Same RESTRICTIVE pattern as projects
-- (20261230000420). Non-crew logins, portal users and the service role
-- (my_role() is distinct from 'crew') are unaffected.

do $$
declare
  t text;
begin
  foreach t in array array[
    'crm_price_adjustments',
    'crm_price_adjustment_lines',
    'crm_contracts',
    'crm_package_services',
    'estimate_line_item_equipment',
    'estimate_line_item_subitems'
  ] loop
    execute format('drop policy if exists crew_no_access on public.%I', t);
    execute format(
      'create policy crew_no_access on public.%I as restrictive for all
         using ((select public.my_role()) is distinct from %L)
         with check ((select public.my_role()) is distinct from %L)',
      t, 'crew', 'crew');
  end loop;
end $$;
