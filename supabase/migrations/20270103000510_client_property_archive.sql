-- Archive a client property.
--
-- A property could be added and edited but never taken out of use, so a
-- client who sold a lot kept it in every job / estimate picker forever.
-- Archiving is a soft "retire": archived_at hides the property from the
-- pickers (the app filters on it) while every job, visit, estimate and
-- report that already points at it keeps working, and it can be unarchived.
-- deleted_at stays the hard-retire flag the merge / cleanup paths use.
--
-- Guard: a property can't be archived while a job that isn't finished
-- (scheduled / in progress / on hold — contract and recurring jobs included)
-- still uses it, and the primary (master) property — the client's own
-- address — can't be archived at all.

alter table public.client_properties
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

comment on column public.client_properties.archived_at is
  'When the property was archived (hidden from job / estimate pickers, history kept). Null = in use.';

create or replace function public.guard_client_property_archive()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_jobs integer;
begin
  if new.archived_at is null then
    new.archived_by := null;
    return new;
  end if;
  if old.archived_at is not null then
    return new;
  end if;

  if new.is_master then
    raise exception 'The primary property is the client''s own address and can''t be archived. Change the client''s address instead.'
      using errcode = '23514';
  end if;

  select count(*) into v_jobs
    from public.crm_jobs j
   where j.property_id = new.id
     and j.deleted_at is null
     and j.status not in ('completed', 'cancelled', 'skipped');
  if v_jobs > 0 then
    raise exception 'This property still has % active job(s). Finish, cancel or move them to another property before archiving it.', v_jobs
      using errcode = '23514';
  end if;

  new.archived_by := coalesce(new.archived_by, auth.uid());
  return new;
end;
$function$;

drop trigger if exists trg_client_properties_guard_archive on public.client_properties;
create trigger trg_client_properties_guard_archive
  before update of archived_at on public.client_properties
  for each row execute function public.guard_client_property_archive();
