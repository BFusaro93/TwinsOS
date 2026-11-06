-- New companies were missing two sets of starter data that existing companies got from
-- one-off backfills:
--
-- 1. Built-in property takeoff field defs (crm_rate_matrix_field_defs). The six from
--    20260715235729_seed_rate_matrix_builtin_takeoffs.sql plus parking_lot_sqft from
--    20261207000700_treated_area_override.sql were inserted for the orgs that existed then and
--    never for any org created later — so on a new company the Rate Matrix "Lookup field"
--    picker and a service's Chemical Area Field had nothing built-in to choose.
--
-- 2. Standard chemical volume/mass and area units (crm_chemical_lookup_items). These were only
--    created client-side the first time someone with chem_create_uom opened Settings → Chemical
--    Tracking, so until then ChemicalApplicationRatesEditor / ChemicalApplicationPanel had empty
--    unit dropdowns. Same names, sort order, unit_class and base_factor as DEFAULT_VOLUME_UNITS /
--    DEFAULT_LOOKUP_ITEMS in ChemicalTrackingSettings.tsx (which stays as a harmless fallback:
--    it only seeds a list that is still empty, and only the names that are missing).
--
-- An AFTER INSERT trigger on organizations now seeds both (pattern:
-- fn_seed_default_estimate_stages), and existing orgs are backfilled.
--
-- Backfill rules are conservative so nothing a company deliberately removed comes back:
--   * field defs: insert a built-in only when the org has NO row for that field_key at all
--     (deleted or not). The unique index (org_id, entity_type, field_key) also covers deleted
--     rows, so ON CONFLICT DO NOTHING is the backstop.
--   * chemical units: seed a list (volume_unit / area_unit) only for an org that has never had
--     a row in that list.

create or replace function public.fn_seed_default_property_fields_and_chemical_units()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.crm_rate_matrix_field_defs (org_id, entity_type, field_key, field_label, field_type, sort_order)
  values
    (new.id, 'property', 'turf_sqft',           'Turf Sq. Ft.',                    'number', 0),
    (new.id, 'property', 'mulch_bed_sqft',      'Mulch Bed Sq. Ft.',               'number', 1),
    (new.id, 'property', 'gross_sqft',          'Gross Sq. Ft.',                   'number', 2),
    (new.id, 'property', 'linear_ft_perimeter', 'Linear Ft. Perimeter',            'number', 3),
    (new.id, 'property', 'linear_ft_edging',    'Linear Ft. Edging',               'number', 4),
    (new.id, 'property', 'yards_of_mulch',      'Yards of Mulch',                  'number', 5),
    (new.id, 'property', 'parking_lot_sqft',    'Parking Lot / Hardscape Sq. Ft.', 'number', 6)
  on conflict (org_id, entity_type, field_key) do nothing;

  insert into public.crm_chemical_lookup_items (org_id, list_type, name, sort_order, unit_class, base_factor)
  values
    (new.id, 'volume_unit', 'Cups',             0, 'volume', 8),
    (new.id, 'volume_unit', 'Gallons',          1, 'volume', 128),
    (new.id, 'volume_unit', 'Grams',            2, 'mass',   1),
    (new.id, 'volume_unit', 'Kilograms',        3, 'mass',   1000),
    (new.id, 'volume_unit', 'Liters',           4, 'volume', 33.814),
    (new.id, 'volume_unit', 'Milliliters',      5, 'volume', 0.033814),
    (new.id, 'volume_unit', 'Ounces - Liquid',  6, 'volume', 1),
    (new.id, 'volume_unit', 'Ounces - Weight',  7, 'mass',   28.3495),
    (new.id, 'volume_unit', 'Pints',            8, 'volume', 16),
    (new.id, 'volume_unit', 'Pounds',           9, 'mass',   453.592),
    (new.id, 'volume_unit', 'Quarts',          10, 'volume', 32),
    (new.id, 'volume_unit', 'Tablespoons',     11, 'volume', 0.5),
    (new.id, 'volume_unit', 'Teaspoons',       12, 'volume', 1.0 / 6),
    (new.id, 'area_unit',   'Square Foot',      0, null, null),
    (new.id, 'area_unit',   '1,000 Sq Ft',      1, null, null),
    (new.id, 'area_unit',   'Acre',             2, null, null),
    (new.id, 'area_unit',   '100 Linear Ft',    3, null, null),
    (new.id, 'area_unit',   '1,000 Linear Ft',  4, null, null);

  return new;
end;
$$;

revoke all on function public.fn_seed_default_property_fields_and_chemical_units() from public, anon, authenticated;

drop trigger if exists trg_seed_default_property_fields_and_chemical_units on public.organizations;
create trigger trg_seed_default_property_fields_and_chemical_units
  after insert on public.organizations
  for each row execute function public.fn_seed_default_property_fields_and_chemical_units();

-- Backfill: built-in property field defs an org never had.
insert into public.crm_rate_matrix_field_defs (org_id, entity_type, field_key, field_label, field_type, sort_order)
select o.id, 'property', v.field_key, v.field_label, 'number', v.sort_order
from public.organizations o
cross join (values
  ('turf_sqft',           'Turf Sq. Ft.',                    0),
  ('mulch_bed_sqft',      'Mulch Bed Sq. Ft.',               1),
  ('gross_sqft',          'Gross Sq. Ft.',                   2),
  ('linear_ft_perimeter', 'Linear Ft. Perimeter',            3),
  ('linear_ft_edging',    'Linear Ft. Edging',               4),
  ('yards_of_mulch',      'Yards of Mulch',                  5),
  ('parking_lot_sqft',    'Parking Lot / Hardscape Sq. Ft.', 6)
) as v(field_key, field_label, sort_order)
where not exists (
  select 1 from public.crm_rate_matrix_field_defs d
   where d.org_id = o.id and d.field_key = v.field_key
)
on conflict (org_id, entity_type, field_key) do nothing;

-- Backfill: standard units for orgs that have never had a row in that list.
insert into public.crm_chemical_lookup_items (org_id, list_type, name, sort_order, unit_class, base_factor)
select o.id, v.list_type, v.name, v.sort_order, v.unit_class, v.base_factor
from public.organizations o
cross join (values
  ('volume_unit', 'Cups',             0, 'volume', 8::numeric),
  ('volume_unit', 'Gallons',          1, 'volume', 128),
  ('volume_unit', 'Grams',            2, 'mass',   1),
  ('volume_unit', 'Kilograms',        3, 'mass',   1000),
  ('volume_unit', 'Liters',           4, 'volume', 33.814),
  ('volume_unit', 'Milliliters',      5, 'volume', 0.033814),
  ('volume_unit', 'Ounces - Liquid',  6, 'volume', 1),
  ('volume_unit', 'Ounces - Weight',  7, 'mass',   28.3495),
  ('volume_unit', 'Pints',            8, 'volume', 16),
  ('volume_unit', 'Pounds',           9, 'mass',   453.592),
  ('volume_unit', 'Quarts',          10, 'volume', 32),
  ('volume_unit', 'Tablespoons',     11, 'volume', 0.5),
  ('volume_unit', 'Teaspoons',       12, 'volume', 1.0 / 6),
  ('area_unit',   'Square Foot',      0, null,     null),
  ('area_unit',   '1,000 Sq Ft',      1, null,     null),
  ('area_unit',   'Acre',             2, null,     null),
  ('area_unit',   '100 Linear Ft',    3, null,     null),
  ('area_unit',   '1,000 Linear Ft',  4, null,     null)
) as v(list_type, name, sort_order, unit_class, base_factor)
where not exists (
  select 1 from public.crm_chemical_lookup_items c
   where c.org_id = o.id and c.list_type = v.list_type
);
