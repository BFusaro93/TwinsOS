-- The crew's "I've read the notes" gate was cosmetic in two ways: it was only
-- enforced client-side, and once given it never re-armed. So the office could
-- change notes_to_crew from "gate code 4471" to "DOG IS LOOSE — do not enter the
-- back yard" at 9:40am and the crew's screen would still show a green
-- "Acknowledged 7:02 AM" over the new text, with Clock In already enabled.
--
-- Re-arming needs to know WHEN the notes last changed. updated_at is useless as
-- a proxy: clock-in, a crew note and a dispatcher reordering the route all bump
-- it, so the gate would re-arm and block Clock In several times a morning for
-- reasons that have nothing to do with the notes. Hence a dedicated stamp,
-- maintained by a trigger so every writer is covered (app, API, MCP, SQL).
--
-- Notes live on both tables — the visit's own notes and the job's — and the crew
-- app shows the union of them for a stop, so both need the stamp.
alter table public.crm_job_visits
  add column if not exists notes_to_crew_updated_at timestamptz;

alter table public.crm_jobs
  add column if not exists notes_to_crew_updated_at timestamptz;

create or replace function public.stamp_notes_to_crew_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.notes_to_crew is not null and btrim(new.notes_to_crew) <> '' then
      new.notes_to_crew_updated_at := coalesce(new.notes_to_crew_updated_at, now());
    end if;
    return new;
  end if;

  if new.notes_to_crew is distinct from old.notes_to_crew then
    new.notes_to_crew_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_notes_to_crew_updated_at on public.crm_job_visits;
create trigger trg_stamp_notes_to_crew_updated_at
  before insert or update on public.crm_job_visits
  for each row execute function public.stamp_notes_to_crew_updated_at();

drop trigger if exists trg_stamp_notes_to_crew_updated_at on public.crm_jobs;
create trigger trg_stamp_notes_to_crew_updated_at
  before insert or update on public.crm_jobs
  for each row execute function public.stamp_notes_to_crew_updated_at();

-- Deliberately left NULL for existing rows rather than backfilled to
-- updated_at. The app treats NULL as "no known change, any acknowledgment
-- counts", so this fails OPEN: nobody is blocked at clock-in on day one over a
-- note they already read. Backfilling from updated_at would do the opposite —
-- it would invalidate every existing acknowledgment at once and stop crews
-- clocking in on the first morning after deploy, for notes that never changed.
