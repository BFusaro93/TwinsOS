-- Parking Lot and Hardscape are now separate zone types in Aerial Measurement, and only Parking Lot
-- feeds the built-in `parking_lot_sqft` takeoff. The field's label still said "Parking Lot / Hardscape
-- Sq. Ft.", which wrongly implies walkways and patios roll into it.
--
-- 1. Existing orgs: relabel the Rate Matrix / Chemical Area built-in field def. Only rows still carrying
--    the old default label change, so an org that deliberately renamed it keeps its own name.
-- 2. New orgs: fn_seed_default_property_fields_and_chemical_units() (20261223000610) hard-codes the old
--    label. Rewrite the live function definition with the label swapped rather than re-stating the whole
--    body, so nothing else in it can drift. Idempotent: a second run finds nothing to replace.

update public.crm_rate_matrix_field_defs
   set field_label = 'Parking Lot Sq. Ft.'
 where field_key = 'parking_lot_sqft'
   and field_label = 'Parking Lot / Hardscape Sq. Ft.';

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.fn_seed_default_property_fields_and_chemical_units()'::regprocedure);
  if position('Parking Lot / Hardscape Sq. Ft.' in v_def) > 0 then
    execute replace(v_def, 'Parking Lot / Hardscape Sq. Ft.', 'Parking Lot Sq. Ft.');
  end if;
end $$;
