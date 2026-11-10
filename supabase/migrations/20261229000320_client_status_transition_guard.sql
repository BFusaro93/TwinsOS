-- Client lifecycle (status) guard.
--
-- Until now clients.status had no database guard: any login that could edit a
-- client could cancel, reactivate, convert or close it (the Clients/Leads bulk
-- route re-checked its keys, but the detail panel and Edit dialog wrote the
-- column directly), and an account that had been a client for years could be
-- put back to "Lead".
--
-- _client_has_been_client(id): the account was ever a client — it has a
--   client_since date, or any (non-deleted) job or invoice.
-- crm_clients_never_converted(ids): the subset of ids (in the caller's org) that
--   were never a client. Moving one of those to Active is a lead CONVERSION
--   (client_since stamped, lead_converted_to_client fired); moving any other
--   account to Active is a reactivation. Used by the app and the bulk route.
--
-- enforce_client_status_transition (BEFORE UPDATE OF status):
--   * An account that is Active now, or was ever a client, can't be set to Lead
--     or Lost (owner decision 2026-11). Leads and lost leads move freely among
--     the lead statuses. Applies to every writer, service role included.
--   * A move to Active of an account that was never a client stamps
--     client_since with the org's date when it is still empty (every caller
--     does this already; this is the safety net for the ones that don't).
--   * Direct writes by a signed-in user (not SECURITY DEFINER RPCs, not the
--     service role) need the permission key for the transition, the same keys
--     the UI gates on (admins pass inside has_settings_permission):
--       lead / lost  → Active                   lead_convert_close
--       lead / lost  → any other status          lead_convert_close or lead_allow_delete
--       any client status → any other status     client_activate_deactivate or client_allow_delete

create or replace function public._client_has_been_client(p_client_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.clients c where c.id = p_client_id and c.client_since is not null)
      or exists (select 1 from public.crm_jobs j where j.client_id = p_client_id and j.deleted_at is null)
      or exists (select 1 from public.crm_invoices i where i.client_id = p_client_id and i.deleted_at is null);
$function$;

revoke all on function public._client_has_been_client(uuid) from public, anon;
grant execute on function public._client_has_been_client(uuid) to authenticated, service_role;

create or replace function public.crm_clients_never_converted(p_client_ids uuid[])
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select c.id
    from public.clients c
   where c.id = any(p_client_ids)
     and c.deleted_at is null
     and not public._org_mismatch(c.org_id)
     and c.client_since is null
     and not exists (select 1 from public.crm_jobs j where j.client_id = c.id and j.deleted_at is null)
     and not exists (select 1 from public.crm_invoices i where i.client_id = c.id and i.deleted_at is null);
$function$;

revoke all on function public.crm_clients_never_converted(uuid[]) from public, anon;
grant execute on function public.crm_clients_never_converted(uuid[]) to authenticated, service_role;

-- SECURITY INVOKER on purpose: _crm_direct_user_write() tells a signed-in
-- user's own write (current_user = authenticated) from a definer RPC / the
-- service role, which a definer trigger would hide.
create or replace function public.enforce_client_status_transition()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_old text := coalesce(old.status, '');
  v_new text := coalesce(new.status, '');
  v_old_is_lead boolean := coalesce(old.status, '') in ('lead', 'lost');
  v_keys text[];
begin
  if v_new = v_old then
    return new;
  end if;

  if v_new in ('lead', 'lost') and not v_old_is_lead
     and (v_old = 'active' or public._client_has_been_client(old.id)) then
    raise exception 'This account has been a client, so it can''t be set back to a lead. Cancel it or set it Inactive instead.'
      using errcode = '23514';
  end if;

  if v_new = 'active' and new.client_since is null
     and not public._client_has_been_client(old.id) then
    new.client_since := public.org_today(new.org_id);
  end if;

  if public._crm_direct_user_write() then
    if v_old_is_lead and v_new = 'active' then
      v_keys := array['lead_convert_close'];
    elsif v_old_is_lead then
      v_keys := array['lead_convert_close', 'lead_allow_delete'];
    else
      v_keys := array['client_activate_deactivate', 'client_allow_delete'];
    end if;
    if not exists (select 1 from unnest(v_keys) k where public.has_settings_permission(k)) then
      raise exception 'You do not have permission to change this account''s status'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_clients_enforce_status_transition on public.clients;
create trigger trg_clients_enforce_status_transition
  before update of status on public.clients
  for each row execute function public.enforce_client_status_transition();
