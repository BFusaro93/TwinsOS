-- Per-linear-foot chemical rates ("2 oz per 100 lin ft") need a linear-foot
-- area unit to pick. New orgs get "100 Linear Ft" and "1,000 Linear Ft" from
-- the Chemical Tracking settings seed; orgs whose area-unit list was already
-- seeded (or hand-built) never re-seed, so add the two units to each of them
-- here, after their existing units, skipping a name the org already has.
-- Orgs with no area units yet are left alone: the settings seed only runs on
-- an empty list and will add all five defaults.
with orgs as (
  select org_id, max(sort_order) as max_sort
  from crm_chemical_lookup_items
  where list_type = 'area_unit' and deleted_at is null
  group by org_id
),
wanted(name, pos) as (
  values ('100 Linear Ft', 1), ('1,000 Linear Ft', 2)
)
insert into crm_chemical_lookup_items (org_id, list_type, name, sort_order)
select o.org_id, 'area_unit', w.name, o.max_sort + w.pos
from orgs o
cross join wanted w
where not exists (
  select 1 from crm_chemical_lookup_items i
  where i.org_id = o.org_id
    and i.list_type = 'area_unit'
    and i.deleted_at is null
    and lower(trim(i.name)) = lower(w.name)
);
