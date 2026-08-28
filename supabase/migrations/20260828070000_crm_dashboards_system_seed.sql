-- Support pre-built ("innate") dashboards that ship out of the box but are
-- fully editable like any user-created dashboard. A system-seeded dashboard
-- is just a normal crm_dashboards row cloned from a code-defined template
-- (src/lib/reports/dashboard-templates.ts) on an org's first Report Center
-- visit; source_template_key + the partial unique index below prevent
-- re-seeding a template the org already has (including one the user deleted).

alter table crm_dashboards
  add column if not exists is_system_seeded boolean not null default false,
  add column if not exists source_template_key text;

create unique index if not exists crm_dashboards_org_template_key_idx
  on crm_dashboards (org_id, source_template_key)
  where source_template_key is not null;
