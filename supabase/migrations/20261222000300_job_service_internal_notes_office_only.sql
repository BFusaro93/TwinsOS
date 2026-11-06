-- A job service's internal (office-only) note was a column on crm_job_services, which
-- crew logins can read in full through the database API ("crew reads job services"
-- is org-only — crews need the service rows for their stops). Nothing in the crew app
-- selects it, but a crew login could GET /rest/v1/crm_job_services?select=internal_note.
--
-- Postgres can't hide one column from some users of the same role, and dozens of office
-- readers select crm_job_services(*), so the note moves to its own table that crew logins
-- can't read. Writers are unchanged: a BEFORE trigger moves whatever is written to
-- crm_job_services.internal_note into the side table and keeps the column empty. The
-- office reads it back through the one-to-one embed crm_job_service_office_notes(note).

create table if not exists public.crm_job_service_office_notes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default my_org_id() references public.organizations(id),
  -- Deferred: the BEFORE INSERT trigger on crm_job_services writes this row before
  -- the service row itself exists.
  job_service_id uuid not null unique
                 references public.crm_job_services(id) on delete cascade
                 deferrable initially deferred,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid()
);

drop trigger if exists crm_job_service_office_notes_set_updated_at on public.crm_job_service_office_notes;
create trigger crm_job_service_office_notes_set_updated_at
  before update on public.crm_job_service_office_notes
  for each row execute function public.set_updated_at();

alter table public.crm_job_service_office_notes enable row level security;

drop policy if exists "office reads job service notes" on public.crm_job_service_office_notes;
create policy "office reads job service notes"
  on public.crm_job_service_office_notes for select to authenticated
  using (
    org_id = public.my_org_id()
    and public.has_crm_access()
    and coalesce(public.my_role(), '') <> 'crew'
  );

-- Same read-only (canceled subscription) policies every org-scoped table carries;
-- authenticated has no write grant here anyway — the trigger below is the only writer.
drop policy if exists read_only_when_canceled_ins on public.crm_job_service_office_notes;
create policy read_only_when_canceled_ins on public.crm_job_service_office_notes as restrictive for insert
  with check ((select public.my_org_is_read_only()) is not true);
drop policy if exists read_only_when_canceled_upd on public.crm_job_service_office_notes;
create policy read_only_when_canceled_upd on public.crm_job_service_office_notes as restrictive for update
  using ((select public.my_org_is_read_only()) is not true)
  with check ((select public.my_org_is_read_only()) is not true);
drop policy if exists read_only_when_canceled_del on public.crm_job_service_office_notes;
create policy read_only_when_canceled_del on public.crm_job_service_office_notes as restrictive for delete
  using ((select public.my_org_is_read_only()) is not true);

revoke all on public.crm_job_service_office_notes from anon;
revoke insert, update, delete on public.crm_job_service_office_notes from authenticated;
grant select on public.crm_job_service_office_notes to authenticated;

-- Move the notes that exist today — before the trigger below exists, or clearing the
-- column would fire it and wipe the notes just moved.
insert into public.crm_job_service_office_notes (org_id, job_service_id, note)
select s.org_id, s.id, s.internal_note
  from public.crm_job_services s
 where nullif(btrim(coalesce(s.internal_note, '')), '') is not null
on conflict (job_service_id) do update set note = excluded.note;

update public.crm_job_services
   set internal_note = null
 where internal_note is not null;

create or replace function public.crm_job_services_move_internal_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(new.internal_note, '')), '');
begin
  -- An INSERT only creates a note row when there is a note; an UPDATE that names the
  -- column (this trigger is UPDATE OF internal_note) sets it, clearing it with null.
  if tg_op = 'INSERT' and v_note is null then
    new.internal_note := null;
    return new;
  end if;
  insert into public.crm_job_service_office_notes (org_id, job_service_id, note)
  values (new.org_id, new.id, v_note)
  on conflict (job_service_id) do update set note = excluded.note;
  new.internal_note := null;
  return new;
end;
$$;
revoke execute on function public.crm_job_services_move_internal_note() from public, anon, authenticated;

drop trigger if exists crm_job_services_move_internal_note on public.crm_job_services;
create trigger crm_job_services_move_internal_note
  before insert or update of internal_note on public.crm_job_services
  for each row execute function public.crm_job_services_move_internal_note();

comment on column public.crm_job_services.internal_note is
  'Write-only alias: a trigger moves anything written here into crm_job_service_office_notes (office-only) and keeps this column empty, so crew logins never read it.';
