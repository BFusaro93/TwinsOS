-- Rate Matrix (crm_service_rate_matrix + crm_property_custom_field_values)
-- keys off a property's custom field value, but estimates had no way to say
-- which property they're for — only client_id, and a client can have many
-- properties. Nullable: most estimates today have no property and should
-- keep behaving exactly as before (flat production_rate / manual budgeting).
alter table estimates
  add column if not exists property_id uuid references client_properties(id);
