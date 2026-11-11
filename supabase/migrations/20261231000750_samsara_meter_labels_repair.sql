-- Repair: meters the Samsara sync auto-created were inserted with no source
-- (defaulted to 'manual') and no asset_name (defaulted to ''), so they showed
-- as manual meters with a blank unit, and the requests / work orders their
-- meter rules raised carried an empty unit name. The sync now sets both.
--
-- 1. Samsara auto-created odometers: the sync's exact shape — named
--    'Odometer', unit 'miles', linked to a vehicle, still source 'manual' with
--    a blank asset_name (the in-app meter dialog always fills the unit name).
update public.meters m
   set source = 'samsara',
       asset_name = v.name
  from public.vehicles v
 where v.id = m.asset_id
   and v.org_id = m.org_id
   and m.deleted_at is null
   and m.source = 'manual'
   and m.name = 'Odometer'
   and m.unit = 'miles'
   and coalesce(btrim(m.asset_name), '') = '';

-- 2. Any other meter linked to a unit but with a blank unit name: fill it in.
update public.meters m
   set asset_name = u.name
  from (
    select id, org_id, name from public.assets
    union all
    select id, org_id, name from public.vehicles
  ) u
 where u.id = m.asset_id
   and u.org_id = m.org_id
   and m.deleted_at is null
   and coalesce(btrim(m.asset_name), '') = ''
   and coalesce(btrim(u.name), '') <> '';

-- 3. Requests / work orders a meter rule raised with that empty name.
update public.maintenance_requests r
   set asset_name = u.name
  from (
    select id, org_id, name from public.assets
    union all
    select id, org_id, name from public.vehicles
  ) u
 where u.id = r.asset_id
   and u.org_id = r.org_id
   and r.asset_name = ''
   and coalesce(btrim(u.name), '') <> '';

update public.work_orders w
   set asset_name = u.name
  from (
    select id, org_id, name from public.assets
    union all
    select id, org_id, name from public.vehicles
  ) u
 where u.id = w.asset_id
   and u.org_id = w.org_id
   and w.asset_name = ''
   and coalesce(btrim(u.name), '') <> '';
