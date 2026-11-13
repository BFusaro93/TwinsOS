-- A second foreign key from crm_job_visits to crm_crews makes every PostgREST
-- embed `crm_crews(name)` on visits ambiguous (PGRST201: "more than one
-- relationship was found"), which broke the dispatch boards and the crew app.
-- 20270101001440 added crm_job_visits.handed_off_from_crew_id with a FK to
-- crm_crews; drop the FK and keep the column as a plain uuid.
alter table public.crm_job_visits drop constraint if exists crm_job_visits_handed_off_from_crew_id_fkey;
