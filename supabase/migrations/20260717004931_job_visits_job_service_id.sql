-- crm_job_visits had no way to reference which specific crm_job_services row
-- (visit) it was scheduling. For a package-type job with multiple services
-- each carrying its own date window (crm_job_services.start_date/complete_by_date
-- — see 20260707000006_crm_packages.sql / crm_package_services), this meant a
-- visit was always "the whole job on one date," with no way to schedule each
-- service/visit independently. The Waiting List page collapsed every service
-- into one summary row and one Dispatch action for exactly this reason.
alter table crm_job_visits
  add column if not exists job_service_id uuid references crm_job_services(id) on delete set null;

create index if not exists crm_job_visits_job_service_id_idx
  on crm_job_visits (job_service_id) where deleted_at is null;
