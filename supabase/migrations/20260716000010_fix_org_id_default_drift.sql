-- Schema drift: these tables have `default my_org_id()` on org_id in test but
-- not in prod. None of their insert call sites set org_id explicitly (every
-- mutation hook in this codebase relies on the column default), so on prod
-- every insert into these tables has been failing with a NOT NULL violation.
-- Confirmed via direct query: prod has zero rows in `estimates` for the org
-- that's actually in use, which lines up exactly with "Failed to create
-- estimate" and "Failed to add section" (sections are estimate_line_items
-- rows) bug reports.
alter table estimates alter column org_id set default my_org_id();
alter table estimate_line_items alter column org_id set default my_org_id();
alter table estimate_direct_costs alter column org_id set default my_org_id();
alter table estimate_templates alter column org_id set default my_org_id();
alter table estimate_template_items alter column org_id set default my_org_id();
alter table crm_rate_matrix_field_defs alter column org_id set default my_org_id();
alter table project_subcontract_costs alter column org_id set default my_org_id();
