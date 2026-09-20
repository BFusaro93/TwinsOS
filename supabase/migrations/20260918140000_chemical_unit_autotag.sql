-- unit_class / base_factor (20260918030000, 20260918031000) were populated by
-- one-time UPDATEs over the rows that existed at the time. Nothing fills them
-- on INSERT, so every volume unit created afterwards lands untagged — and an
-- untagged unit makes calcChemicalAndSolution return `unresolved`, silently
-- withholding the mix volume from the crew for that product forever.
--
-- The settings UI now resolves known names on manual add, but that only covers
-- rows created through that one screen; the public API, MCP tools, imports and
-- direct SQL all still create untagged units. Doing it in the database covers
-- every writer, including new orgs seeded after today.
--
-- Bare 'Ounce' / 'oz' are deliberately absent from the table below, exactly as
-- 20260918031000 left them: unlike 'Ounces - Liquid' / 'Ounces - Weight' they
-- don't say which unit class is meant, and guessing wrong is a ~28x error on a
-- pesticide mix. Those stay NULL and the calc keeps refusing them, which is the
-- safe outcome.
--
-- Canonical base units match the TS side (src/lib/chemical-mix-calc.ts):
-- fluid ounce for volume, gram for mass.
create or replace function public.tag_chemical_volume_unit()
returns trigger
language plpgsql
as $$
declare
  v_name text;
begin
  if new.list_type is distinct from 'volume_unit' then
    return new;
  end if;

  -- An explicit value from the caller always wins; this only fills blanks.
  if new.unit_class is not null or new.base_factor is not null then
    return new;
  end if;

  v_name := lower(btrim(coalesce(new.name, '')));

  new.base_factor := case v_name
    when 'teaspoon'       then 1.0 / 6   when 'teaspoons'       then 1.0 / 6
    when 'tsp'            then 1.0 / 6
    when 'tablespoon'     then 0.5       when 'tablespoons'     then 0.5
    when 'tbsp'           then 0.5
    when 'cup'            then 8         when 'cups'            then 8
    when 'fluid ounce'    then 1         when 'fluid ounces'    then 1
    when 'ounce - liquid' then 1         when 'ounces - liquid' then 1
    when 'fl oz'          then 1
    when 'pint'           then 16        when 'pints'           then 16
    when 'pt'             then 16
    when 'quart'          then 32        when 'quarts'          then 32
    when 'qt'             then 32
    when 'gallon'         then 128       when 'gallons'         then 128
    when 'gal'            then 128
    when 'milliliter'     then 0.033814  when 'milliliters'     then 0.033814
    when 'ml'             then 0.033814
    when 'liter'          then 33.814    when 'liters'          then 33.814
    when 'l'              then 33.814
    when 'gram'           then 1         when 'grams'           then 1
    when 'g'              then 1
    when 'kilogram'       then 1000      when 'kilograms'       then 1000
    when 'kg'             then 1000
    when 'ounce - weight' then 28.3495   when 'ounces - weight' then 28.3495
    when 'pound'          then 453.592   when 'pounds'          then 453.592
    when 'lb'             then 453.592   when 'lbs'             then 453.592
    else null
  end;

  if new.base_factor is not null then
    new.unit_class := case
      when v_name in (
        'gram', 'grams', 'g', 'kilogram', 'kilograms', 'kg',
        'ounce - weight', 'ounces - weight',
        'pound', 'pounds', 'lb', 'lbs'
      ) then 'mass'
      else 'volume'
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tag_chemical_volume_unit on public.crm_chemical_lookup_items;
create trigger trg_tag_chemical_volume_unit
  before insert on public.crm_chemical_lookup_items
  for each row execute function public.tag_chemical_volume_unit();

-- Catch up any volume unit that was created between 20260918031000 and this
-- migration, plus the abbreviations neither earlier pass covered.
update public.crm_chemical_lookup_items t
set unit_class  = s.unit_class,
    base_factor = s.base_factor
from (
  select l.id,
         case
           when lower(btrim(l.name)) in (
             'gram', 'grams', 'g', 'kilogram', 'kilograms', 'kg',
             'ounce - weight', 'ounces - weight',
             'pound', 'pounds', 'lb', 'lbs'
           ) then 'mass'
           else 'volume'
         end as unit_class,
         case lower(btrim(l.name))
           when 'teaspoon' then 1.0/6 when 'teaspoons' then 1.0/6 when 'tsp' then 1.0/6
           when 'tablespoon' then 0.5 when 'tablespoons' then 0.5 when 'tbsp' then 0.5
           when 'cup' then 8 when 'cups' then 8
           when 'fluid ounce' then 1 when 'fluid ounces' then 1
           when 'ounce - liquid' then 1 when 'ounces - liquid' then 1 when 'fl oz' then 1
           when 'pint' then 16 when 'pints' then 16 when 'pt' then 16
           when 'quart' then 32 when 'quarts' then 32 when 'qt' then 32
           when 'gallon' then 128 when 'gallons' then 128 when 'gal' then 128
           when 'milliliter' then 0.033814 when 'milliliters' then 0.033814 when 'ml' then 0.033814
           when 'liter' then 33.814 when 'liters' then 33.814 when 'l' then 33.814
           when 'gram' then 1 when 'grams' then 1 when 'g' then 1
           when 'kilogram' then 1000 when 'kilograms' then 1000 when 'kg' then 1000
           when 'ounce - weight' then 28.3495 when 'ounces - weight' then 28.3495
           when 'pound' then 453.592 when 'pounds' then 453.592
           when 'lb' then 453.592 when 'lbs' then 453.592
           else null
         end as base_factor
  from public.crm_chemical_lookup_items l
  where l.list_type = 'volume_unit'
    and l.unit_class is null
    and l.base_factor is null
) s
where t.id = s.id
  and s.base_factor is not null;
