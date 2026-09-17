-- Chemical mix-volume calculation: lets the app derive total finished-mix
-- solution volume (e.g. "43 gallons of mix") from a product's application
-- rate + dilution ratio, for display to crew/techs, instead of only ever
-- showing the raw active-ingredient/concentrate amount.
--
-- 1. Unit conversion metadata on the volume_unit lookup list. Only
--    recognized standard unit names get tagged with a class + a factor to
--    a canonical base unit (fluid ounce for volume, gram for mass) — an
--    org-renamed or org-added custom unit has no factor, and the calc
--    simply skips it rather than guess at a conversion.
alter table crm_chemical_lookup_items
  add column if not exists unit_class  text check (unit_class in ('volume', 'mass')),
  add column if not exists base_factor numeric;

update crm_chemical_lookup_items
set unit_class = 'volume',
    base_factor = case lower(trim(name))
      when 'teaspoons'       then 1.0 / 6
      when 'tablespoons'     then 0.5
      when 'cups'            then 8
      when 'ounces - liquid' then 1
      when 'pints'           then 16
      when 'quarts'          then 32
      when 'gallons'         then 128
      when 'milliliters'     then 0.033814
      when 'liters'          then 33.814
    end
where list_type = 'volume_unit'
  and lower(trim(name)) in (
    'teaspoons', 'tablespoons', 'cups', 'ounces - liquid', 'pints',
    'quarts', 'gallons', 'milliliters', 'liters'
  );

update crm_chemical_lookup_items
set unit_class = 'mass',
    base_factor = case lower(trim(name))
      when 'grams'           then 1
      when 'kilograms'       then 1000
      when 'ounces - weight' then 28.3495
      when 'pounds'          then 453.592
    end
where list_type = 'volume_unit'
  and lower(trim(name)) in ('grams', 'kilograms', 'ounces - weight', 'pounds');

-- 2. crm_chemical_applications.unit_of_measure_id is the unit for
--    chemical_amount only. solution_amount (the finished-mix volume) needs
--    its own unit — it is not always the same unit as the concentrate
--    amount (e.g. chemical measured in ounces, solution measured in
--    gallons) — so a shared column would mislabel one of the two values.
alter table crm_chemical_applications
  add column if not exists solution_unit_of_measure_id uuid
    references crm_chemical_lookup_items(id) on delete set null;
