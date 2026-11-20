-- Generalize rename_ticket_category into rename_org_list_option: rename any
-- Settings list option and carry the new name to every column that stores it
-- as text, so existing records do not keep the old name.
--
--   ticket_categories      crm_tickets.category, client_portal_settings.portal_ticket_categories
--   cancellation_reasons   clients.cancellation_reason
--   client_sources         clients.source, estimates.source
--   estimate_reasons       estimates.reason        (won reasons)
--   estimate_lost_reasons  estimates.reason        (lost reasons)
--   service_categories     crm_services.category
--   client_tags            client_tags.tag
--   contact_types          client_contacts.contact_type
--
-- payment_methods is NOT renamable here (its values are codes with separate
-- custom labels). Ticket categories "Uncategorized" and "Upsell" stay locked:
-- code and reports match on the literal. Automation / form configs that quote
-- an option by text are not rewritten.
--
-- SECURITY DEFINER, gated by the same settings permission as the list's RLS,
-- scoped to my_org_id() (never a parameter), not callable by anon.

drop function if exists public.rename_ticket_category(uuid, text);

create or replace function public.rename_org_list_option(p_id uuid, p_new_value text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid := public.my_org_id();
  v_old text;
  v_list text;
  v_new text := btrim(coalesce(p_new_value, ''));
begin
  if auth.uid() is null or v_org is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_new = '' then
    raise exception 'Enter a name.' using errcode = '22023';
  end if;

  select value, list_name into v_old, v_list from public.crm_list_options
   where id = p_id and org_id = v_org and deleted_at is null;
  if v_old is null then
    raise exception 'Option not found.' using errcode = 'P0002';
  end if;
  if v_list not in ('ticket_categories','cancellation_reasons','client_sources','estimate_reasons',
                    'estimate_lost_reasons','service_categories','client_tags','contact_types') then
    raise exception 'Options in this list cannot be renamed.' using errcode = '42501';
  end if;
  if not public.has_settings_permission(public.settings_permission_for_list_name(v_list)) then
    raise exception 'You do not have permission to edit this list.' using errcode = '42501';
  end if;
  if v_list = 'ticket_categories' then
    if v_old in ('Uncategorized', 'Upsell') then
      raise exception '"%" is a built-in category and cannot be renamed.', v_old using errcode = '42501';
    end if;
    if v_new in ('Uncategorized', 'Upsell') then
      raise exception '"%" is reserved for a built-in category.', v_new using errcode = '22023';
    end if;
  end if;
  if v_new = v_old then
    return v_new;
  end if;
  if exists (select 1 from public.crm_list_options
              where org_id = v_org and list_name = v_list and deleted_at is null
                and id <> p_id and lower(value) = lower(v_new)) then
    raise exception 'An option named "%" already exists in this list.', v_new using errcode = '23505';
  end if;

  update public.crm_list_options set value = v_new where id = p_id and org_id = v_org;

  if v_list = 'ticket_categories' then
    update public.crm_tickets set category = v_new where org_id = v_org and category = v_old;
    update public.client_portal_settings
       set portal_ticket_categories = array_replace(portal_ticket_categories, v_old, v_new)
     where org_id = v_org and v_old = any(portal_ticket_categories);
  elsif v_list = 'cancellation_reasons' then
    update public.clients set cancellation_reason = v_new where org_id = v_org and cancellation_reason = v_old;
  elsif v_list = 'client_sources' then
    update public.clients set source = v_new where org_id = v_org and source = v_old;
    update public.estimates set source = v_new where org_id = v_org and source = v_old;
  elsif v_list in ('estimate_reasons', 'estimate_lost_reasons') then
    update public.estimates set reason = v_new where org_id = v_org and reason = v_old;
  elsif v_list = 'service_categories' then
    update public.crm_services set category = v_new where org_id = v_org and category = v_old;
  elsif v_list = 'client_tags' then
    -- a client that somehow already carries the new name would violate
    -- unique (org_id, client_id, tag): drop its old-name row instead
    delete from public.client_tags t where t.org_id = v_org and t.tag = v_old
      and exists (select 1 from public.client_tags n where n.org_id = v_org and n.client_id = t.client_id and n.tag = v_new);
    update public.client_tags set tag = v_new where org_id = v_org and tag = v_old;
  elsif v_list = 'contact_types' then
    update public.client_contacts set contact_type = v_new where org_id = v_org and contact_type = v_old;
  end if;

  return v_new;
end;
$function$;

revoke all on function public.rename_org_list_option(uuid, text) from public, anon;
grant execute on function public.rename_org_list_option(uuid, text) to authenticated;
