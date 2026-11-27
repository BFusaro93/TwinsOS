-- A visit's crew note used to hold a stored COPY of the job note plus the service
-- note. The app now reads the job note, the service note and the note written on
-- the visit separately (visitNoteSections), so those copies would show stale text
-- the next time the job or service note is edited. Clear every visit whose note is
-- only such a copy; a note someone wrote on the visit does not match and is kept.
--
-- The notes_to_crew_updated_at stamp trigger is switched off for the update so the
-- crew isn't asked to re-read notes that did not change.

create or replace function pg_temp.nb(t text) returns text language sql immutable as $$
  select case
    when t is null then null
    when btrim(regexp_replace(t, '<[^>]*>', '', 'g')) = '' and t !~* '<img' then null
    else t
  end
$$;

alter table public.crm_job_visits disable trigger trg_stamp_notes_to_crew_updated_at;

update public.crm_job_visits v
set notes_to_crew = null
from public.crm_jobs j
where j.id = v.job_id
  and v.notes_to_crew is not null
  and v.notes_to_crew = any (array_remove(array[
    -- the job note alone (older visit generation)
    pg_temp.nb(j.notes_to_crew),
    -- job note + this visit's service note
    (select nullif(concat_ws('<p></p>', pg_temp.nb(j.notes_to_crew), pg_temp.nb(s.job_note)), '')
       from public.crm_job_services s where s.id = v.job_service_id),
    -- a whole-job visit: job note + every service's note, in service order
    case when v.job_service_id is null then
      (select nullif(concat_ws('<p></p>', pg_temp.nb(j.notes_to_crew),
          string_agg(pg_temp.nb(s2.job_note), '<p></p>' order by s2.sort_order)), '')
         from public.crm_job_services s2 where s2.job_id = j.id)
    end
  ], null));

alter table public.crm_job_visits enable trigger trg_stamp_notes_to_crew_updated_at;
