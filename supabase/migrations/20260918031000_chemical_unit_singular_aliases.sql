-- Follow-up to 20260918030000_chemical_mix_volume_calc.sql: production data
-- showed orgs also have singular-form volume/mass unit names (e.g. "Gallon"
-- alongside "Gallons") that the plural-only name match left untagged. Add
-- the unambiguous singular aliases so the mix-volume calc can convert them
-- too. "Ounce" alone is deliberately excluded — unlike "Ounces - Liquid" /
-- "Ounces - Weight" it doesn't say which unit class it means, and guessing
-- risks a wrong conversion.
update crm_chemical_lookup_items
set unit_class = 'volume',
    base_factor = case lower(trim(name))
      when 'teaspoon'     then 1.0 / 6
      when 'tablespoon'   then 0.5
      when 'cup'          then 8
      when 'fluid ounce'  then 1
      when 'pint'         then 16
      when 'quart'        then 32
      when 'gallon'       then 128
      when 'milliliter'   then 0.033814
      when 'liter'        then 33.814
    end
where list_type = 'volume_unit'
  and unit_class is null
  and lower(trim(name)) in (
    'teaspoon', 'tablespoon', 'cup', 'fluid ounce', 'pint', 'quart',
    'gallon', 'milliliter', 'liter'
  );

update crm_chemical_lookup_items
set unit_class = 'mass',
    base_factor = case lower(trim(name))
      when 'gram'   then 1
      when 'kilogram' then 1000
      when 'pound'  then 453.592
    end
where list_type = 'volume_unit'
  and unit_class is null
  and lower(trim(name)) in ('gram', 'kilogram', 'pound');
