-- Equipt CMMS rows can't be hard-deleted from an end-user session
-- (bug sweep round 14, finding F5).
--
-- The FOR ALL org policies allowed DELETE. A hard delete skips the soft-delete
-- path, and on work orders it cascades away wo_parts / wo_labor_entries /
-- wo_vendor_charges without returning deducted stock (set_wo_part_stock never
-- runs), so the stock is lost along with the cost history.
--
-- Every app path soft-deletes these tables (deleted_at), and no database
-- function hard-deletes them (checked on TEST: no `delete from` on these
-- tables in any public function). The service role and FK cascades from a
-- service-role delete are unaffected (policies target authenticated only).
--
-- DEPLOY: BEFORE the code deploy (old code never hard-deletes these tables).

do $$
declare
  t text;
begin
  foreach t in array array[
    'work_orders', 'wo_parts', 'wo_labor_entries', 'wo_vendor_charges',
    'parts', 'assets', 'vehicles', 'asset_parts',
    'meters', 'meter_readings', 'maintenance_requests',
    'pm_schedules', 'pm_schedule_parts', 'pm_schedule_assets',
    'pm_schedule_asset_parts', 'pm_schedule_pauses', 'pm_schedule_cadence_history',
    'automations', 'asset_status_history'
  ] loop
    execute format('drop policy if exists no_hard_delete on public.%I', t);
    execute format(
      'create policy no_hard_delete on public.%I as restrictive for delete to authenticated using (false)',
      t
    );
  end loop;
end $$;
