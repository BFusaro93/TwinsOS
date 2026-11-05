-- Services: the UI gates Delete on service_delete and Bulk Prices on
-- service_bulk_price, but both write plain UPDATEs (delete = set deleted_at;
-- bulk prices = default_rate_cents / matrix_tail_rate_cents), and the UPDATE
-- policy only admitted scheduling_settings or service_edit. A custom role
-- holding just one of those keys got a success toast while nothing changed.
--
-- The UPDATE policy now admits all four keys, and a trigger narrows what the
-- two partial keys may touch: service_delete may only set/clear deleted_at,
-- service_bulk_price may only change the price columns. scheduling_settings /
-- service_edit keep full edit. SECURITY DEFINER callers (price-adjustment
-- runs, which carry their own permission check) and trigger cascades are not
-- re-checked here.

drop policy if exists "settings_permission_update_crm_services" on public.crm_services;
create policy "settings_permission_update_crm_services" on public.crm_services
  for update
  using (org_id = public.my_org_id()
    and (public.has_settings_permission('scheduling_settings') or public.has_settings_permission('service_edit')
         or public.has_settings_permission('service_delete') or public.has_settings_permission('service_bulk_price')))
  with check (org_id = public.my_org_id());

create or replace function public.enforce_crm_services_partial_write_keys()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_allowed text[] := array['updated_at'];
  v_changed boolean;
begin
  if auth.uid() is null
     or current_user not in ('authenticated', 'anon')
     or pg_trigger_depth() > 1 then
    return new;
  end if;
  if public.has_settings_permission('scheduling_settings') or public.has_settings_permission('service_edit') then
    return new;
  end if;
  if public.has_settings_permission('service_delete') then
    v_allowed := v_allowed || array['deleted_at'];
  end if;
  if public.has_settings_permission('service_bulk_price') then
    v_allowed := v_allowed || array['default_rate_cents', 'matrix_tail_rate_cents'];
  end if;
  v_changed := (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed);
  if v_changed then
    raise exception 'You do not have permission to edit this service'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists a_enforce_crm_services_partial_write_keys on public.crm_services;
create trigger a_enforce_crm_services_partial_write_keys
  before update on public.crm_services
  for each row execute function public.enforce_crm_services_partial_write_keys();
