-- Link photo jobs directly to a CRM client (mirrors projects.client_id).
-- Nullable and additive: existing rows keep matching by free-text
-- customer_name, so the CMMS Job Photos workflow is unaffected until a
-- real client is deliberately linked.

alter table photo_jobs
  add column if not exists client_id uuid references clients(id) on delete set null;

create index if not exists idx_photo_jobs_client_id on photo_jobs(client_id) where deleted_at is null;
