-- Link CRM project-type jobs to the Projects (PO cost-tracking) table.
-- crm_jobs.project_id already existed as a bare uuid column with an
-- "integration point" comment but no enforced relationship; add the FK now.
alter table crm_jobs
  add constraint crm_jobs_project_id_fkey
  foreign key (project_id) references projects(id);
