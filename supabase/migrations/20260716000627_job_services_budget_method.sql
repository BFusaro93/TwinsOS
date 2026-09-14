-- crm_job_services never actually persisted service_id (the UI tracks it but
-- every insert path drops it before hitting the DB) or budget_method. Without
-- service_id there is no way to join back to crm_services for the assumed
-- production rate, which blocks any production-rate-accuracy reporting. This
-- adds the snapshot column and best-effort backfills both from what data
-- exists today (matching by service_name where service_id was never set).

alter table crm_job_services
  add column if not exists budget_method text not null default 'manual'
    check (budget_method in ('manual', 'production_rate'));

-- Best-effort recovery: match rows missing service_id by their service_name
-- snapshot against the org's current service catalog.
update crm_job_services jsv
set service_id = cs.id
from crm_services cs
where jsv.service_id is null
  and jsv.org_id = cs.org_id
  and jsv.service_name = cs.name
  and cs.deleted_at is null;

update crm_job_services jsv
set budget_method = cs.budget_method
from crm_services cs
where jsv.service_id = cs.id;
