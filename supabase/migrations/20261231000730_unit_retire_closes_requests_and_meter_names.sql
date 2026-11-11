-- Assets and vehicles: keep dependent rows in step when a unit changes.
--
-- 1. Retired unit (soft-deleted, or status moved to disposed / sold): its
--    still-open maintenance requests (open / in_review / approved, not yet
--    linked to a work order) are closed as 'rejected' with a note appended to
--    the description. Before, a meter-raised request for a unit that no longer
--    exists stayed open forever and counted as an overdue PM in v_pm_outcomes.
--    Done in the database so every delete / dispose path (asset & vehicle
--    panels, bulk import, /api/v1, Zapier, MCP) behaves the same.
-- 2. Renamed unit: meters.asset_name (a denormalized copy) follows the new
--    name, so the Meters list and the requests / work orders meter rules raise
--    carry the current name.
--
-- SECURITY DEFINER so the cleanup isn't limited by the acting user's role
-- (e.g. a purchaser retiring an asset can't otherwise triage requests);
-- every write is scoped to the unit's own org and id. Runs as a cascade, so
-- the maintenance_requests limited-role guard (20261231000700) doesn't apply.
create or replace function public.cmms_unit_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := case when tg_table_name = 'vehicles' then 'Vehicle' else 'Asset' end;
  v_retired boolean;
  v_note text;
begin
  if new.name is distinct from old.name then
    update public.meters
       set asset_name = coalesce(new.name, '')
     where org_id = new.org_id
       and asset_id = new.id
       and deleted_at is null
       and asset_name is distinct from coalesce(new.name, '');
  end if;

  v_retired :=
       (old.deleted_at is null and new.deleted_at is not null)
    or (new.status in ('disposed', 'sold')
        and old.status is distinct from new.status
        and coalesce(old.status, '') not in ('disposed', 'sold'));

  if v_retired then
    v_note := format(
      'Closed automatically: %s "%s" was %s.',
      v_kind,
      coalesce(nullif(btrim(new.name), ''), 'unnamed'),
      case when new.deleted_at is not null and old.deleted_at is null
           then 'deleted'
           else 'marked ' || new.status end
    );
    update public.maintenance_requests
       set status = 'rejected',
           description = concat_ws(E'\n\n', nullif(btrim(description), ''), v_note)
     where org_id = new.org_id
       and asset_id = new.id
       and deleted_at is null
       and linked_work_order_id is null
       and status in ('open', 'in_review', 'approved');
  end if;

  return null;
end;
$$;

revoke all on function public.cmms_unit_after_update() from public, anon, authenticated;

drop trigger if exists trg_assets_after_update_sync on public.assets;
create trigger trg_assets_after_update_sync
  after update of name, status, deleted_at on public.assets
  for each row execute function public.cmms_unit_after_update();

drop trigger if exists trg_vehicles_after_update_sync on public.vehicles;
create trigger trg_vehicles_after_update_sync
  after update of name, status, deleted_at on public.vehicles
  for each row execute function public.cmms_unit_after_update();

-- One-time repair: close requests already left open on retired units.
update public.maintenance_requests r
   set status = 'rejected',
       description = concat_ws(
         E'\n\n', nullif(btrim(r.description), ''),
         format('Closed automatically: %s "%s" was %s.',
                u.kind, coalesce(nullif(btrim(u.name), ''), 'unnamed'),
                case when u.deleted_at is not null then 'deleted' else 'marked ' || u.status end))
  from (
    select id, org_id, name, status, deleted_at, 'Asset' as kind from public.assets
    union all
    select id, org_id, name, status, deleted_at, 'Vehicle' from public.vehicles
  ) u
 where u.id = r.asset_id
   and u.org_id = r.org_id
   and (u.deleted_at is not null or u.status in ('disposed', 'sold'))
   and r.deleted_at is null
   and r.linked_work_order_id is null
   and r.status in ('open', 'in_review', 'approved');
