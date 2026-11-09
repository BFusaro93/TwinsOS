-- crm_sync_personal_crew(): when an employee's login changes (user_id A → B,
-- or A → null) the personal crew kept user_id A — `coalesce(user_id, …)` only
-- ever fills an empty slot — so login A could still sign in to the crew app
-- as this person's crew after being unlinked.
--
-- Now, when old.user_id <> new.user_id, the personal crew's login follows the
-- employee — but only if the crew's login is still the OLD one (or empty), so
-- a login someone deliberately set on the crew is left alone:
--   * moved to new.user_id when no other live crew in the org holds it;
--   * otherwise cleared (login A no longer belongs to this person, and
--     two crews can't share login B).
-- Applies whether or not the personal crew is currently wanted (an inactive
-- employee's retired crew must not keep the old login for when it returns).
--
-- Starts from the live definition (TEST, 2026-11-08); everything else is
-- unchanged.

CREATE OR REPLACE FUNCTION public.crm_sync_personal_crew()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text := nullif(trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')), '');
  v_crew uuid;
  v_want boolean := new.assignable_to_jobs and new.is_active and new.deleted_at is null;
  v_login_changed boolean := tg_op = 'UPDATE' and old.user_id is distinct from new.user_id;
begin
  select id into v_crew from public.crm_crews
   where personal_employee_id = new.id and deleted_at is null
   order by created_at limit 1;

  -- The employee's login changed: move the personal crew's login with it.
  if v_login_changed and v_crew is not null then
    update public.crm_crews c
       set user_id = case
             when new.user_id is not null and not exists (
                    select 1 from public.crm_crews o
                     where o.user_id = new.user_id and o.org_id = new.org_id
                       and o.deleted_at is null and o.id <> v_crew)
             then new.user_id
           end,
           updated_at = now()
     where c.id = v_crew
       and (c.user_id is null or c.user_id = old.user_id);
  end if;

  if not v_want then
    if v_crew is not null then
      update public.crm_crews set is_active = false, updated_at = now() where id = v_crew and is_active;
    end if;
    return new;
  end if;

  if v_crew is null then
    insert into public.crm_crews (org_id, name, is_active, personal_employee_id, foreman_id, user_id)
    values (
      new.org_id, coalesce(v_name, 'Employee'), true, new.id, new.id,
      case when new.user_id is not null and not exists (
             select 1 from public.crm_crews c
              where c.user_id = new.user_id and c.org_id = new.org_id and c.deleted_at is null)
           then new.user_id end
    )
    returning id into v_crew;
  else
    update public.crm_crews
       set is_active = true,
           name = coalesce(v_name, name),
           foreman_id = new.id,
           user_id = coalesce(user_id,
             case when new.user_id is not null and not exists (
                    select 1 from public.crm_crews c
                     where c.user_id = new.user_id and c.org_id = new.org_id
                       and c.deleted_at is null and c.id <> v_crew)
                  then new.user_id end),
           updated_at = now()
     where id = v_crew;
  end if;

  -- Someone who works a regular crew can't also be on a second crew on the same
  -- days (prevent_crew_member_day_overlap), so their personal crew keeps no
  -- standing roster row; they join it for a day through Team Assignment. A
  -- person on no crew (an owner or office employee) is its roster.
  if not exists (select 1 from public.crm_crew_members where crew_id = v_crew and employee_id = new.id and deleted_at is null) then
    begin
      insert into public.crm_crew_members (org_id, crew_id, employee_id, name, is_foreman)
      values (new.org_id, v_crew, new.id, coalesce(v_name, 'Employee'), true);
    exception when raise_exception then
      null;
    end;
  else
    update public.crm_crew_members set name = coalesce(v_name, name)
     where crew_id = v_crew and employee_id = new.id and deleted_at is null;
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.crm_sync_personal_crew() FROM PUBLIC, anon, authenticated;
