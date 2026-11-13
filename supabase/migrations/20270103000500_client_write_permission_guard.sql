-- Client / lead write permissions, enforced in the database.
--
-- Add Client / Add Lead, Allow Edit and Allow Cancel/Deactivate (client_add,
-- client_allow_edit, client_allow_delete and their lead_* twins) were only
-- checked by the UI hiding buttons, so any CRM login could add, edit or
-- soft-delete clients, contacts and properties straight through the API.
--
-- Same pattern as enforce_estimate_write_permission: only a signed-in user's
-- own direct write is checked (_crm_direct_user_write) — service-role routes,
-- SECURITY DEFINER RPCs (crm_merge_clients, crm_unsubscribe_client,
-- sync_client_balance …) and trigger cascades stand aside. Leads (status lead
-- or lost) use the lead_* keys, everything else the client_* keys.
--
-- What each write needs:
--   INSERT clients ............ client_add (lead_add for a lead / lost row), or
--                               the CSV import keys client_bulk_create /
--                               lead_bulk_create / imports
--   setting / clearing deleted_at  client_allow_delete (lead_allow_delete)
--   any other change .......... client_allow_edit (lead_allow_edit)
-- Columns that other guards already own or that are derived are not counted
-- as an "edit": status changes (enforce_client_status_transition checks the
-- activate / convert / close keys) with the reason / closed / since stamps that
-- travel with them, balances and stored payment details
-- (enforce_client_sensitive_column_permissions), geocode / address-check
-- results, the QuickBooks link, the bounce flag and updated_at. The Bulk Edit
-- fields (account type, source, priority, OK to email, do not market, the
-- org tax-rate push) are also allowed with client_bulk_edit, which the bulk
-- route and enforce_client_bulk_edit_permission already check.
--
-- client_contacts / client_properties: adding, changing or removing one is an
-- edit of its client, so it needs the client's (or lead's) Allow Edit key.

create or replace function public.enforce_client_write_permission()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_lead boolean;
  v_changed text[];
  v_free constant text[] := array[
    'updated_at', 'lat', 'lng', 'address_verdict', 'address_verified_at',
    'email_bounced_at', 'qbo_customer_id', 'unsubscribe_token',
    'balance_outstanding_cents', 'balance_uninvoiced_cents',
    'balance_credits_cents', 'balance_prepay_cents',
    'stripe_customer_id', 'saved_payment_method_id', 'saved_payment_method_type',
    'saved_payment_method_summary', 'autopay_enabled'];
  v_status_cols constant text[] := array['status', 'cancellation_reason', 'closed_at', 'client_since'];
  v_bulk_cols constant text[] := array[
    'account_type', 'source', 'priority', 'ok_to_email', 'do_not_market',
    'default_tax_rate_bps', 'status'];
begin
  if not public._crm_direct_user_write() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_lead := coalesce(new.status, '') in ('lead', 'lost');
    -- Add, or the CSV import keys (Bulk Create on the list page, Imports in Settings).
    if public.has_settings_permission(case when v_lead then 'lead_add' else 'client_add' end)
       or public.has_settings_permission(case when v_lead then 'lead_bulk_create' else 'client_bulk_create' end)
       or public.has_settings_permission('imports') then
      return new;
    end if;
    raise exception 'You do not have permission to add %', case when v_lead then 'leads' else 'clients' end
      using errcode = '42501';
  end if;

  -- crm_merge_clients is SECURITY DEFINER (already exempt); kept for any
  -- future invoker-rights merge step.
  if public._client_merge_rpc_active(old.id) then
    return new;
  end if;

  v_lead := coalesce(old.status, '') in ('lead', 'lost');

  if new.deleted_at is distinct from old.deleted_at then
    if not public.has_settings_permission(case when v_lead then 'lead_allow_delete' else 'client_allow_delete' end) then
      raise exception 'You do not have permission to delete %', case when v_lead then 'leads' else 'clients' end
        using errcode = '42501';
    end if;
    -- A deleted account can't keep charging its card on its own.
    if new.deleted_at is not null then
      new.autopay_enabled := false;
    end if;
    return new;
  end if;

  select coalesce(array_agg(n.key), '{}')
    into v_changed
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key);

  v_changed := array(select unnest(v_changed) except select unnest(v_free));
  if new.status is distinct from old.status then
    v_changed := array(select unnest(v_changed) except select unnest(v_status_cols));
  end if;

  if cardinality(v_changed) = 0 then
    return new;
  end if;

  if public.has_settings_permission(case when v_lead then 'lead_allow_edit' else 'client_allow_edit' end) then
    return new;
  end if;

  if v_changed <@ v_bulk_cols and public.has_settings_permission('client_bulk_edit') then
    return new;
  end if;

  -- A CSV import links sub-accounts to their parent after inserting the rows;
  -- an importer may finish that on the accounts they created in the last hour.
  if v_changed <@ array['parent_client_id']
     and old.created_by = auth.uid()
     and old.created_at > now() - interval '1 hour'
     and (public.has_settings_permission(case when v_lead then 'lead_bulk_create' else 'client_bulk_create' end)
          or public.has_settings_permission('imports')) then
    return new;
  end if;

  raise exception 'You do not have permission to edit %', case when v_lead then 'leads' else 'clients' end
    using errcode = '42501';
end;
$function$;

drop trigger if exists trg_clients_enforce_write_permission on public.clients;
create trigger trg_clients_enforce_write_permission
  before insert or update on public.clients
  for each row execute function public.enforce_client_write_permission();


create or replace function public.enforce_client_child_write_permission()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_client uuid := coalesce(new.client_id, old.client_id);
  v_status text;
  v_lead boolean;
  v_changed text[];
  v_free constant text[] := array['updated_at', 'lat', 'lng', 'address_verdict', 'address_verified_at'];
  v_what text := case tg_table_name when 'client_contacts' then 'contacts' else 'properties' end;
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if public._client_merge_rpc_active(v_client) then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key), '{}')
      into v_changed
      from jsonb_each(to_jsonb(new)) n
     where n.value is distinct from (to_jsonb(old) -> n.key);
    v_changed := array(select unnest(v_changed) except select unnest(v_free));
    if cardinality(v_changed) = 0 then
      return new;
    end if;
  end if;

  select c.status into v_status from public.clients c where c.id = v_client;
  v_lead := coalesce(v_status, '') in ('lead', 'lost');

  if public.has_settings_permission(case when v_lead then 'lead_allow_edit' else 'client_allow_edit' end) then
    return coalesce(new, old);
  end if;

  raise exception 'You do not have permission to change % on this %', v_what, case when v_lead then 'lead' else 'client' end
    using errcode = '42501';
end;
$function$;

drop trigger if exists trg_client_contacts_enforce_write_permission on public.client_contacts;
create trigger trg_client_contacts_enforce_write_permission
  before insert or update or delete on public.client_contacts
  for each row execute function public.enforce_client_child_write_permission();

drop trigger if exists trg_client_properties_enforce_write_permission on public.client_properties;
create trigger trg_client_properties_enforce_write_permission
  before insert or update or delete on public.client_properties
  for each row execute function public.enforce_client_child_write_permission();
