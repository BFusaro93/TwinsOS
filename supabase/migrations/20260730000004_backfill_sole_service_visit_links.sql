-- Companion to the generate-visits route change that now links every
-- auto-generated recurring visit to its job's sole service when the job has
-- exactly one (previously only package-job visits, and manually-added
-- visits where the "Add Visit" dialog's service picker was used, ever set
-- job_service_id). Backfill existing unlinked visits on single-service jobs
-- of any job_type — not just recurring — since some package jobs also have
-- pre-job_service_id-era visits (see generate-visits' own dedupe comment).
-- Multi-service jobs are left untouched: there's no way to know which
-- service an existing unlinked visit was for without more information.
with single_service_jobs as (
  select job_id, (array_agg(id))[1] as sole_service_id
  from crm_job_services
  group by job_id
  having count(*) = 1
)
update crm_job_visits v
set job_service_id = ssj.sole_service_id
from single_service_jobs ssj
where v.job_id = ssj.job_id
  and v.deleted_at is null
  and v.job_service_id is null;
