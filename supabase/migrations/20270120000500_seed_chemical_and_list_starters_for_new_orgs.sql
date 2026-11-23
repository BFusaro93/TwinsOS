-- Starter lists for NEW companies, so a fresh org isn't empty where it can't
-- work without them:
--   chemical Application Methods and Areas Treated (logging an application needs them)
--   Cancellation Reasons (the four defaults + common ones)
--   Contact Types (the five defaults + Property Manager, Primary, Spouse)
-- Deliberately NOT seeded: Targets, Client Sources, Tags, Discounts, Custom
-- fields, Other Charges (company-specific). Existing orgs are untouched.
--
-- Same pattern as fn_seed_default_property_fields_and_chemical_units (AFTER INSERT
-- on organizations, SECURITY DEFINER).

create or replace function public.fn_seed_default_chemical_lists_and_list_options()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.crm_chemical_lookup_items (org_id, list_type, name, sort_order)
  values
    (new.id, 'application_method', 'Broadcast Sprayer',                 0),
    (new.id, 'application_method', 'Cup',                               1),
    (new.id, 'application_method', 'Granular Broadcast Spreader',       2),
    (new.id, 'application_method', 'Granular Drop Spreader',            3),
    (new.id, 'application_method', 'Hand',                              4),
    (new.id, 'application_method', 'Handheld Sprayer',                  5),
    (new.id, 'application_method', 'Handheld Spreader',                 6),
    (new.id, 'application_method', 'Manual Backpack Sprayer',           7),
    (new.id, 'application_method', 'Motorized Backpack Sprayer',        8),
    (new.id, 'application_method', 'Motorized Truck-mounted Spray Rig', 9),
    (new.id, 'application_method', 'Scoop',                            10),
    (new.id, 'areas_treated', 'Building',               0),
    (new.id, 'areas_treated', 'Fence Line',             1),
    (new.id, 'areas_treated', 'Garden & flower beds',   2),
    (new.id, 'areas_treated', 'Gravel / Rock Beds',     3),
    (new.id, 'areas_treated', 'Hardscape',              4),
    (new.id, 'areas_treated', 'Mulch Beds',             5),
    (new.id, 'areas_treated', 'Parking Lot / Pavement', 6),
    (new.id, 'areas_treated', 'Perimeter',              7),
    (new.id, 'areas_treated', 'Pond',                   8),
    (new.id, 'areas_treated', 'Trees and/or shrubs',    9),
    (new.id, 'areas_treated', 'Turf',                  10);

  insert into public.crm_list_options (org_id, list_name, value, sort_order)
  values
    (new.id, 'cancellation_reasons', 'Price',                    0),
    (new.id, 'cancellation_reasons', 'Moved',                    1),
    (new.id, 'cancellation_reasons', 'Unhappy with service',     2),
    (new.id, 'cancellation_reasons', 'No longer needs service',  3),
    (new.id, 'cancellation_reasons', 'Went With Competitor',     4),
    (new.id, 'cancellation_reasons', 'Doing It Themselves',      5),
    (new.id, 'cancellation_reasons', 'Sold House',               6),
    (new.id, 'cancellation_reasons', 'Other',                    7),
    (new.id, 'cancellation_reasons', 'Unknown',                  8),
    (new.id, 'contact_types', 'Owner',            0),
    (new.id, 'contact_types', 'Billing contact',  1),
    (new.id, 'contact_types', 'Site manager',     2),
    (new.id, 'contact_types', 'Decision maker',   3),
    (new.id, 'contact_types', 'Property Manager', 4),
    (new.id, 'contact_types', 'Primary',          5),
    (new.id, 'contact_types', 'Spouse',           6),
    (new.id, 'contact_types', 'Other',            7)
  on conflict (org_id, list_name, value) do nothing;

  return new;
end;
$function$;

revoke all on function public.fn_seed_default_chemical_lists_and_list_options() from public, anon, authenticated;

drop trigger if exists trg_seed_default_chemical_lists_and_list_options on public.organizations;
create trigger trg_seed_default_chemical_lists_and_list_options
  after insert on public.organizations
  for each row execute function public.fn_seed_default_chemical_lists_and_list_options();
