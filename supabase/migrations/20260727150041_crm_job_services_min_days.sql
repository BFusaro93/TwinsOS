-- Snapshot crm_package_services.min_days onto crm_job_services at job-creation time so
-- visit-completion logic can recalculate the next package-sequenced visit's date from
-- the ACTUAL completion date, instead of only the static date chain computed once by
-- computePackageVisitSchedule() in NewJobDialog.
alter table crm_job_services
  add column if not exists min_days integer;
