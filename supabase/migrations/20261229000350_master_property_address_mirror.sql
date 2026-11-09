-- The client's "Primary" property (client_properties.is_master) copied the
-- client's address once, when it was auto-created, and never followed it: edit
-- the client's service address and every job/estimate that picked the Primary
-- property kept routing to the old one (and editing the Primary property's
-- address left the client record stale).
--
-- Mirror the address both ways, the way takeoffs are mirrored in
-- useUpdateClient: client service address → Primary property, and Primary
-- property address → client service address (and billing too when the client's
-- billing is "same as service"). Coordinates and the address check result
-- travel with the address. A blank address is never copied over a real one.
-- A transaction-local flag (app.client_master_address_sync) stops each mirror
-- from re-triggering the other.
--
-- SECURITY INVOKER: the mirrored write runs under the caller's RLS, so it can
-- never reach a row the caller couldn't edit directly.

create or replace function public.sync_client_address_to_master_property()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if coalesce(current_setting('app.client_master_address_sync', true), '') = 'on' then
    return null;
  end if;
  if (new.service_address, new.service_city, new.service_state, new.service_zip)
     is not distinct from (old.service_address, old.service_city, old.service_state, old.service_zip) then
    return null;
  end if;
  if nullif(btrim(coalesce(new.service_address, '')), '') is null or new.deleted_at is not null then
    return null;
  end if;

  perform set_config('app.client_master_address_sync', 'on', true);
  update public.client_properties p
     set address = new.service_address,
         city = new.service_city,
         state = new.service_state,
         zip = new.service_zip,
         lat = new.lat,
         lng = new.lng,
         address_verdict = new.address_verdict,
         address_verified_at = new.address_verified_at
   where p.client_id = new.id
     and p.org_id = new.org_id
     and p.is_master
     and p.deleted_at is null
     and (p.address, p.city, p.state, p.zip)
         is distinct from (new.service_address, new.service_city, new.service_state, new.service_zip);
  perform set_config('app.client_master_address_sync', 'off', true);
  return null;
end;
$function$;

drop trigger if exists trg_clients_sync_master_property_address on public.clients;
create trigger trg_clients_sync_master_property_address
  after update of service_address, service_city, service_state, service_zip on public.clients
  for each row execute function public.sync_client_address_to_master_property();

create or replace function public.sync_master_property_address_to_client()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if coalesce(current_setting('app.client_master_address_sync', true), '') = 'on' then
    return null;
  end if;
  if not new.is_master or new.deleted_at is not null then
    return null;
  end if;
  if (new.address, new.city, new.state, new.zip)
     is not distinct from (old.address, old.city, old.state, old.zip) then
    return null;
  end if;
  if nullif(btrim(coalesce(new.address, '')), '') is null then
    return null;
  end if;

  perform set_config('app.client_master_address_sync', 'on', true);
  update public.clients c
     set service_address = new.address,
         service_city = new.city,
         service_state = new.state,
         service_zip = new.zip,
         billing_address = case when c.billing_same_as_service then new.address else c.billing_address end,
         billing_city = case when c.billing_same_as_service then new.city else c.billing_city end,
         billing_state = case when c.billing_same_as_service then new.state else c.billing_state end,
         billing_zip = case when c.billing_same_as_service then new.zip else c.billing_zip end,
         lat = new.lat,
         lng = new.lng,
         address_verdict = new.address_verdict,
         address_verified_at = new.address_verified_at
   where c.id = new.client_id
     and c.org_id = new.org_id
     and c.deleted_at is null
     and (c.service_address, c.service_city, c.service_state, c.service_zip)
         is distinct from (new.address, new.city, new.state, new.zip);
  perform set_config('app.client_master_address_sync', 'off', true);
  return null;
end;
$function$;

drop trigger if exists trg_client_properties_sync_master_address on public.client_properties;
create trigger trg_client_properties_sync_master_address
  after update of address, city, state, zip on public.client_properties
  for each row execute function public.sync_master_property_address_to_client();
