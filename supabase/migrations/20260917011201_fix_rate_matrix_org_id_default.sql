-- crm_service_rate_matrix and crm_property_custom_field_values (added in
-- 20260629012636_sprint4_estimates_advanced.sql) were left out of the
-- fix_org_id_default_drift pass — org_id is NOT NULL with no default, and
-- the client-side upsert hooks (use-rate-matrix.ts) never set org_id
-- themselves, so every insert violates the not-null constraint. This is why
-- "Add Row" on the Rate Matrix tab always fails.

alter table crm_service_rate_matrix alter column org_id set default my_org_id();
alter table crm_property_custom_field_values alter column org_id set default my_org_id();
