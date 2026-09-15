-- Contracts had no way to define "N visits of this service are included"
-- (e.g. a seasonal maintenance contract bundling 25 lawn mowings) — the only
-- existing per-job "Quantity" on the Jobs Under Contract tab is a snapshot
-- of crm_job_services.qty, not a contract-level cap tracked against actual
-- completed visits. crm_contract_services adds that: one row per bundled
-- service on a contract, with how many visits are included.

create table if not exists crm_contract_services (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default my_org_id() references organizations(id),
  contract_id     uuid not null references crm_contracts(id) on delete cascade,
  service_id      uuid references crm_services(id),
  service_name    text not null,  -- snapshot, same pattern as crm_job_services.service_name
  visits_included integer not null default 0 check (visits_included >= 0),
  sort_order      integer not null default 0,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id)
);

create index on crm_contract_services (org_id, contract_id) where deleted_at is null;

alter table crm_contract_services enable row level security;

create policy "org members can manage crm_contract_services"
  on crm_contract_services for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create trigger set_crm_contract_services_updated_at
  before update on crm_contract_services
  for each row execute function set_updated_at();
