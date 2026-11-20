-- Rename a ticket category and carry the change to everything that stores the
-- name as text, so existing tickets and the client-portal category picker do
-- not silently keep the old name.
--
-- "Uncategorized" (the fallback) and "Upsell" (crew field upsells; code and
-- reports match on the literal) cannot be renamed. Duplicate names
-- (case-insensitive) are refused.
--
-- SECURITY DEFINER with an explicit gate: caller must pass the same settings
-- permission the list editor's RLS uses, and everything is scoped to
-- my_org_id() (never a parameter). Not callable by anon.

create or replace function public.rename_ticket_category(p_id uuid, p_new_value text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org uuid := public.my_org_id();
  v_old text;
  v_new text := btrim(coalesce(p_new_value, ''));
begin
  if auth.uid() is null or v_org is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.has_settings_permission(public.settings_permission_for_list_name('ticket_categories')) then
    raise exception 'You do not have permission to edit ticket categories.' using errcode = '42501';
  end if;
  if v_new = '' then
    raise exception 'Enter a category name.' using errcode = '22023';
  end if;

  select value into v_old from public.crm_list_options
   where id = p_id and org_id = v_org and list_name = 'ticket_categories' and deleted_at is null;
  if v_old is null then
    raise exception 'Category not found.' using errcode = 'P0002';
  end if;
  if v_old in ('Uncategorized', 'Upsell') then
    raise exception '"%" is a built-in category and cannot be renamed.', v_old using errcode = '42501';
  end if;
  if v_new in ('Uncategorized', 'Upsell') then
    raise exception '"%" is reserved for a built-in category.', v_new using errcode = '22023';
  end if;
  if v_new = v_old then
    return v_new;
  end if;
  if exists (select 1 from public.crm_list_options
              where org_id = v_org and list_name = 'ticket_categories' and deleted_at is null
                and id <> p_id and lower(value) = lower(v_new)) then
    raise exception 'A ticket category named "%" already exists.', v_new using errcode = '23505';
  end if;

  update public.crm_list_options set value = v_new where id = p_id and org_id = v_org;
  update public.crm_tickets set category = v_new where org_id = v_org and category = v_old;
  update public.client_portal_settings
     set portal_ticket_categories = array_replace(portal_ticket_categories, v_old, v_new)
   where org_id = v_org and v_old = any(portal_ticket_categories);

  return v_new;
end;
$function$;

revoke all on function public.rename_ticket_category(uuid, text) from public, anon;
grant execute on function public.rename_ticket_category(uuid, text) to authenticated;
