-- The Rate Matrix tab's "Lookup field" dropdown (ServiceDialog.tsx) reads from
-- crm_rate_matrix_field_defs, but nothing has ever written rows into that table —
-- there's no management UI for it, so the dropdown was permanently empty ("— None —"
-- only) for every org. Seed the built-in property takeoff fields (the same six
-- surfaced as read-only rows in Settings > CRM > Custom Client Fields, and stored as
-- literal columns on `clients`) so a rate matrix can be built against them.
--
-- field_key matches the corresponding `clients` column name so future code that
-- resolves a client's value for a matrix lookup can map field_key -> column directly.
insert into crm_rate_matrix_field_defs (org_id, entity_type, field_key, field_label, field_type, sort_order)
select o.id, 'property', v.field_key, v.field_label, 'number', v.sort_order
from organizations o
cross join (values
  ('turf_sqft', 'Turf Sq. Ft.', 0),
  ('mulch_bed_sqft', 'Mulch Bed Sq. Ft.', 1),
  ('gross_sqft', 'Gross Sq. Ft.', 2),
  ('linear_ft_perimeter', 'Linear Ft. Perimeter', 3),
  ('linear_ft_edging', 'Linear Ft. Edging', 4),
  ('yards_of_mulch', 'Yards of Mulch', 5)
) as v(field_key, field_label, sort_order)
where not exists (
  select 1 from crm_rate_matrix_field_defs d
  where d.org_id = o.id and d.field_key = v.field_key and d.deleted_at is null
);
