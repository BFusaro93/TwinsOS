-- Companion to the generate-visits route change that now generates one
-- visit per service per date for multi-service recurring jobs (previously
-- one combined, unlinked visit). Historical unlinked visits can't be
-- retroactively split — a single actual_hours number covering N services
-- has no record of the real per-service split, so per-service reporting is
-- only accurate from this migration forward. But future-dated, untouched
-- visits (not yet clocked in, no actual hours, not completed) CAN be safely
-- split in place right now, rather than waiting for the next "Generate
-- Visits" run to add duplicates alongside them.
--
-- For each such visit: link it to the job's lowest-sort_order service
-- (preserving the dispatcher's crew_id/start_time/order_num/priority/
-- notes_to_crew — this is what makes it safe, no dispatcher edits or route
-- ordering are lost), then insert sibling rows for the job's remaining
-- services with the same fields copied.
with multi_service_jobs as (
  select job_id, (array_agg(id order by sort_order))[1] as first_service_id
  from crm_job_services
  where included is distinct from false
  group by job_id
  having count(*) >= 2
),
visits_to_link as (
  select v.id as visit_id, msj.first_service_id
  from crm_job_visits v
  join multi_service_jobs msj on msj.job_id = v.job_id
  where v.job_service_id is null
    and v.deleted_at is null
    and v.scheduled_date >= current_date
    and v.status in ('scheduled', 'dispatched')
    and v.clocked_in_at is null
    and v.actual_hours is null
    and v.completed_at is null
),
updated as (
  update crm_job_visits v
  set job_service_id = vtl.first_service_id
  from visits_to_link vtl
  where v.id = vtl.visit_id
  returning v.id, v.job_id, v.client_id, v.scheduled_date, v.crew_id, v.start_time, v.order_num, v.priority, v.notes_to_crew, v.job_service_id
)
insert into crm_job_visits (job_id, client_id, scheduled_date, crew_id, start_time, order_num, priority, notes_to_crew, job_service_id)
select u.job_id, u.client_id, u.scheduled_date, u.crew_id, u.start_time, u.order_num, u.priority, u.notes_to_crew, s.id
from updated u
join crm_job_services s on s.job_id = u.job_id and s.included is distinct from false and s.id != u.job_service_id;
