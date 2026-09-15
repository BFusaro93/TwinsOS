-- Report Center view backing the new "Contract Service Usage" report — an
-- org-wide equivalent of the Included Services tab added on the contract
-- detail dialog (crm_contract_services), which only shows one contract at a
-- time. This lets someone see every contract running over its included
-- visit count in one table instead of opening each contract individually.
--
-- Usage-counting mirrors useContractServiceVisitCounts/
-- useContractJobServiceRows in src/lib/hooks/use-contracts.ts exactly:
-- a completed visit only counts toward a bundled service if it's linked
-- (crm_job_visits.job_service_id) to a crm_job_services row matching by
-- service_id, or by service_name when both sides have no service_id.
create or replace view rpt_contract_service_usage
with (security_invoker = on) as
select
  cs.id,
  cs.org_id,
  cs.contract_id,
  ct.title as contract_title,
  ct.status as contract_status,
  ct.start_date as contract_start_date,
  ct.end_date as contract_end_date,
  cl.display_name as client_name,
  cs.service_name,
  cs.visits_included,
  coalesce(usage.visits_used, 0) as visits_used,
  cs.visits_included - coalesce(usage.visits_used, 0) as visits_remaining,
  (coalesce(usage.visits_used, 0) > cs.visits_included) as is_over
from crm_contract_services cs
join crm_contracts ct on ct.id = cs.contract_id and ct.deleted_at is null
join clients cl on cl.id = ct.client_id and cl.deleted_at is null
left join lateral (
  select count(*) as visits_used
  from crm_job_visits v
  join crm_job_services js on js.id = v.job_service_id
  join crm_jobs j on j.id = v.job_id
  where j.contract_id = cs.contract_id
    and v.status = 'completed'
    and v.deleted_at is null
    and (
      (cs.service_id is not null and js.service_id = cs.service_id)
      or (cs.service_id is null and js.service_id is null and js.service_name = cs.service_name)
    )
) usage on true
where cs.deleted_at is null;
