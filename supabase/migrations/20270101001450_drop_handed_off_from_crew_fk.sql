-- A second foreign key from crm_job_visits to crm_crews makes every PostgREST embed `crm_crews(name)` on visits ambiguous (PGRST201), which breaks the dispatch boards and the crew app. handed_off_from_crew_id stays as a plain uuid column.
alter table public.crm_job_visits drop constraint if exists crm_job_visits_handed_off_from_crew_id_fkey;
