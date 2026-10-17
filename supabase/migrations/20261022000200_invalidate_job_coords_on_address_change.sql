-- Keep cached map coordinates honest when an address changes.
--
-- /api/crm/jobs/geocode trusts crm_jobs.lat/lng first, then the property's, then
-- the client's. Nothing cleared the job's copy when its address (or the
-- property/client address it resolves to) changed, so the waiting-list "nearby"
-- check and route pins kept using the OLD location indefinitely. clients.lat/lng
-- is also shared between the service and billing address sources, so a change to
-- either must drop it.
--
-- Each row clears its OWN coordinates when its address changes (unless that same
-- UPDATE also sets new coordinates — the geocoder's cache write), and an AFTER
-- trigger clears the jobs that inherit the address (no address or property of
-- their own). Cleared coordinates are simply re-geocoded on the next call.

create or replace function public.crm_jobs_clear_coords_on_address_change()
returns trigger language plpgsql as $$
begin
  if (new.service_address is distinct from old.service_address
      or new.service_city is distinct from old.service_city
      or new.service_state is distinct from old.service_state
      or new.service_zip is distinct from old.service_zip
      or new.property_id is distinct from old.property_id)
     and new.lat is not distinct from old.lat
     and new.lng is not distinct from old.lng then
    new.lat := null;
    new.lng := null;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_jobs_clear_coords on public.crm_jobs;
create trigger crm_jobs_clear_coords
  before update on public.crm_jobs
  for each row execute function public.crm_jobs_clear_coords_on_address_change();

create or replace function public.clients_clear_coords_on_address_change()
returns trigger language plpgsql as $$
begin
  if (new.service_address is distinct from old.service_address
      or new.service_city is distinct from old.service_city
      or new.service_state is distinct from old.service_state
      or new.service_zip is distinct from old.service_zip
      or new.billing_address is distinct from old.billing_address
      or new.billing_city is distinct from old.billing_city
      or new.billing_state is distinct from old.billing_state
      or new.billing_zip is distinct from old.billing_zip)
     and new.lat is not distinct from old.lat
     and new.lng is not distinct from old.lng then
    new.lat := null;
    new.lng := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_clear_coords on public.clients;
create trigger clients_clear_coords
  before update on public.clients
  for each row execute function public.clients_clear_coords_on_address_change();

create or replace function public.client_properties_clear_coords_on_address_change()
returns trigger language plpgsql as $$
begin
  if (new.address is distinct from old.address
      or new.city is distinct from old.city
      or new.state is distinct from old.state
      or new.zip is distinct from old.zip)
     and new.lat is not distinct from old.lat
     and new.lng is not distinct from old.lng then
    new.lat := null;
    new.lng := null;
  end if;
  return new;
end;
$$;

drop trigger if exists client_properties_clear_coords on public.client_properties;
create trigger client_properties_clear_coords
  before update on public.client_properties
  for each row execute function public.client_properties_clear_coords_on_address_change();

-- Jobs that INHERIT an address (no job-level address of their own) lose their
-- cached copy when the source address changes. SECURITY DEFINER: the actor may be
-- a staff session whose RLS shouldn't matter for housekeeping on the same org's
-- jobs; the update is scoped to the changed row's own client/property.
create or replace function public.clear_inherited_job_coords()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'clients' then
    if new.lat is null and old.lat is not null
       and (new.service_address is distinct from old.service_address
         or new.service_city is distinct from old.service_city
         or new.service_state is distinct from old.service_state
         or new.service_zip is distinct from old.service_zip
         or new.billing_address is distinct from old.billing_address
         or new.billing_city is distinct from old.billing_city
         or new.billing_state is distinct from old.billing_state
         or new.billing_zip is distinct from old.billing_zip) then
      update public.crm_jobs
         set lat = null, lng = null
       where client_id = new.id
         and property_id is null
         and coalesce(btrim(service_address), '') = ''
         and lat is not null;
    end if;
  elsif tg_table_name = 'client_properties' then
    if new.lat is null and old.lat is not null
       and (new.address is distinct from old.address
         or new.city is distinct from old.city
         or new.state is distinct from old.state
         or new.zip is distinct from old.zip) then
      update public.crm_jobs
         set lat = null, lng = null
       where property_id = new.id
         and coalesce(btrim(service_address), '') = ''
         and lat is not null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_inherited_job_coords() from public, anon, authenticated;

drop trigger if exists clients_clear_inherited_job_coords on public.clients;
create trigger clients_clear_inherited_job_coords
  after update on public.clients
  for each row execute function public.clear_inherited_job_coords();

drop trigger if exists client_properties_clear_inherited_job_coords on public.client_properties;
create trigger client_properties_clear_inherited_job_coords
  after update on public.client_properties
  for each row execute function public.clear_inherited_job_coords();
