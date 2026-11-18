-- Read-only (canceled / expired trial) enforcement for vehicle_telematics_snapshots.
-- Every org-scoped table needs these RESTRICTIVE policies (migration-drift
-- check); same definitions as 20261220000600. The table is only written by the
-- service role, but the policies keep it consistent with every other table.

DROP POLICY IF EXISTS read_only_when_canceled_ins ON public.vehicle_telematics_snapshots;
DROP POLICY IF EXISTS read_only_when_canceled_upd ON public.vehicle_telematics_snapshots;
DROP POLICY IF EXISTS read_only_when_canceled_del ON public.vehicle_telematics_snapshots;

CREATE POLICY read_only_when_canceled_ins ON public.vehicle_telematics_snapshots AS RESTRICTIVE FOR INSERT
  WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE);
CREATE POLICY read_only_when_canceled_upd ON public.vehicle_telematics_snapshots AS RESTRICTIVE FOR UPDATE
  USING ((SELECT my_org_is_read_only()) IS NOT TRUE)
  WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE);
CREATE POLICY read_only_when_canceled_del ON public.vehicle_telematics_snapshots AS RESTRICTIVE FOR DELETE
  USING ((SELECT my_org_is_read_only()) IS NOT TRUE);
