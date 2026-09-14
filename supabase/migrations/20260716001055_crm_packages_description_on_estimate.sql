-- crm_services already has a description_on_estimate field distinct from its
-- internal `description` (see 20260619000009_crm_service_settings.sql) — the
-- client-facing text shown when the service appears on an estimate. Packages
-- only had the internal-admin `description` field with no equivalent, so a
-- package's estimate-facing wording had nowhere to live.
alter table crm_packages
  add column if not exists description_on_estimate text;
