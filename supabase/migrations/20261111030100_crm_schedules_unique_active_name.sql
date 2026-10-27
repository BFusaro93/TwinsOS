-- One live schedule name per org. Jobs point at their schedule BY NAME
-- (crm_jobs.schedule), so two live schedules with the same name make the
-- generator's name->row lookup ambiguous (last row wins).
-- Any pre-existing duplicates (none on PROD when written) are renamed
-- deterministically first: the oldest keeps its name, the rest become
-- "<name> (2)", "<name> (3)", ... so the index can be created.

with ranked as (
  select id, name,
         row_number() over (partition by org_id, lower(name) order by created_at, id) as rn
  from public.crm_schedules
  where deleted_at is null
)
update public.crm_schedules s
   set name = s.name || ' (' || r.rn || ')'
  from ranked r
 where s.id = r.id and r.rn > 1;

create unique index if not exists crm_schedules_org_lower_name_active_uidx
  on public.crm_schedules (org_id, lower(name))
  where deleted_at is null;
