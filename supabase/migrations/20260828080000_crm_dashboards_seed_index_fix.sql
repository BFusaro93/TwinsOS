-- The partial unique index from 20260828070000 (where source_template_key is
-- not null) can't be used as a plain ON CONFLICT (org_id, source_template_key)
-- target by PostgREST/postgrest-js upserts — Postgres only infers a partial
-- index as an arbiter when the ON CONFLICT clause repeats its WHERE predicate,
-- which supabase-js's upsert() has no way to express. Swap to a full unique
-- index; NULLs (every pre-existing, non-seeded dashboard) already don't
-- conflict with each other or with anything else under a standard unique
-- index, so this has the same practical effect for seeded rows.

drop index if exists crm_dashboards_org_template_key_idx;

create unique index if not exists crm_dashboards_org_template_key_idx
  on crm_dashboards (org_id, source_template_key);
