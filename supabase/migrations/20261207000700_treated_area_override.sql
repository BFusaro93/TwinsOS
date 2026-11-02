-- Treated-area override for chemical quantities.
--
-- Until now every chemical estimate (Materials Needed, Daily Load List, the
-- crew preload and the application panel) sized itself from ONE org-wide
-- property measurement (the Area Custom Field, e.g. Turf Sq. Ft.). Two real
-- cases that gets wrong:
--   1. A service that treats a different surface (parking-lot weed control
--      should size from Parking Lot / Hardscape Sq. Ft., not turf).
--   2. A job that treats only part of the property (a spot treatment, the
--      front lawn): the quoted area is not the stored property measurement.
--
-- Resolution order (see src/lib/chemical-area.ts): the job service's
-- treated_area, else the service's own chemical_area_field_id, else the org's
-- Area Custom Field.

alter table crm_services
  add column if not exists chemical_area_field_id uuid references crm_rate_matrix_field_defs(id);

alter table crm_job_services
  add column if not exists treated_area numeric check (treated_area is null or treated_area > 0);

alter table estimate_line_items
  add column if not exists treated_area numeric check (treated_area is null or treated_area > 0);

-- "Parking Lot / Hardscape Sq. Ft." is a literal client_properties column
-- (parking_lot_sqft, 20261026000100) and chemical-area.ts already maps it, but
-- it was never seeded as a field def (the 20260715235729 seed predates the
-- column), so it could not be picked as a service's chemical area field or as
-- a rate-matrix lookup field.
insert into crm_rate_matrix_field_defs (org_id, entity_type, field_key, field_label, field_type, sort_order)
select o.id, 'property', 'parking_lot_sqft', 'Parking Lot / Hardscape Sq. Ft.', 'number', 6
from organizations o
where not exists (
  select 1 from crm_rate_matrix_field_defs d
  where d.org_id = o.id and d.field_key = 'parking_lot_sqft' and d.deleted_at is null
);
