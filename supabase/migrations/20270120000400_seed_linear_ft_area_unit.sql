-- New companies' starter chemical area units now include a plain "Linear Ft"
-- (1 ft per unit), alongside 100 / 1,000 Linear Ft, the way Square Foot sits
-- beside 1,000 Sq Ft. areaBasis() reads the name: no 100 / 1,000 means factor 1.
--
-- Re-states fn_seed_default_property_fields_and_chemical_units from its live
-- definition; only the area_unit rows changed (Linear Ft at 3, the two scaled
-- linear units move to 4 and 5). Existing orgs are untouched: their lists are
-- theirs, and the Settings screen only seeds a list nobody has touched.

create or replace function public.fn_seed_default_property_fields_and_chemical_units()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.crm_rate_matrix_field_defs (org_id, entity_type, field_key, field_label, field_type, sort_order)
  values
    (new.id, 'property', 'turf_sqft',           'Turf Sq. Ft.',                    'number', 0),
    (new.id, 'property', 'mulch_bed_sqft',      'Mulch Bed Sq. Ft.',               'number', 1),
    (new.id, 'property', 'gross_sqft',          'Gross Sq. Ft.',                   'number', 2),
    (new.id, 'property', 'linear_ft_perimeter', 'Linear Ft. Perimeter',            'number', 3),
    (new.id, 'property', 'linear_ft_edging',    'Linear Ft. Edging',               'number', 4),
    (new.id, 'property', 'yards_of_mulch',      'Yards of Mulch',                  'number', 5),
    (new.id, 'property', 'parking_lot_sqft',    'Parking Lot Sq. Ft.', 'number', 6)
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
    (new.id, 'area_unit',   'Linear Ft',        3, null, null),
    (new.id, 'area_unit',   '100 Linear Ft',    4, null, null),
    (new.id, 'area_unit',   '1,000 Linear Ft',  5, null, null);

  return new;
end;
$function$;

revoke all on function public.fn_seed_default_property_fields_and_chemical_units() from public, anon, authenticated;
