-- Security hotfix (bug sweep round 12): crew logins could read and rewrite
-- snow pricing and storms.
--
-- crm_snow_rate_tiers (per-inch / per-push contract pricing: rate_cents,
-- rate_per_inch_cents), crm_storm_events, crm_snow_routes and
-- crm_snow_route_stops only checked org + has_crm_access() + not read-only,
-- and has_crm_access() is true for a crew login (a shared field tablet). A
-- crew could read every snow price, change what every per-inch/per-push storm
-- bills, and create, rename or close storms. Round 11's crew lockdown
-- (20261231000350) covered the other pricing side tables but missed these.
--
-- Nothing the crew app does touches these tables: the crew routes and
-- screens never read or write them, and the only database code that does is
-- the office's snow RPCs (add_snow_route_stop, reorder_snow_route_stops,
-- save_storm_order_to_snow_routes) and the SECURITY DEFINER audit log. So a
-- RESTRICTIVE deny for crew on every command, the same crew_no_access shape
-- as 20261231000350, closes it without touching office access.
do $$
declare
  t text;
begin
  foreach t in array array[
    'crm_snow_rate_tiers',
    'crm_storm_events',
    'crm_snow_routes',
    'crm_snow_route_stops'
  ] loop
    execute format('drop policy if exists crew_no_access on public.%I', t);
    execute format(
      'create policy crew_no_access on public.%I as restrictive for all
         using ((select public.my_role()) is distinct from %L)
         with check ((select public.my_role()) is distinct from %L)',
      t, 'crew', 'crew');
  end loop;
end $$;
