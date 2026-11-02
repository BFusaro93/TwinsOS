-- A new org's owner had no crm_employees row: My Day's "Mine" view was always empty and the
-- owner couldn't be picked as sales rep or assignee. When the founding admin's profile is
-- created (handle_new_user's self-signup branch) and the org has no employees yet, create an
-- employee linked to that login with the seeded Owner role (seeded on org insert by
-- trg_seed_default_crm_roles). Invited admins of an existing org are unaffected: their org
-- already has employees, or the invite route links one.
create or replace function public.create_owner_employee_for_founder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_name    text := coalesce(nullif(trim(new.name), ''), split_part(coalesce(new.email, ''), '@', 1), 'Owner');
  v_first   text;
  v_last    text;
begin
  if new.role is distinct from 'admin' or new.org_id is null then
    return new;
  end if;
  if exists (select 1 from public.crm_employees e where e.org_id = new.org_id) then
    return new;
  end if;

  select id into v_role_id
  from public.crm_roles
  where org_id = new.org_id and name = 'Owner' and deleted_at is null
  order by created_at
  limit 1;

  v_first := split_part(v_name, ' ', 1);
  v_last  := nullif(trim(substr(v_name, length(v_first) + 1)), '');

  insert into public.crm_employees (org_id, first_name, last_name, email, user_id, crm_role_id, is_active, is_sales_rep)
  values (new.org_id, coalesce(nullif(v_first, ''), 'Owner'), coalesce(v_last, '-'), new.email, new.id, v_role_id, true, true);

  return new;
end;
$$;

drop trigger if exists trg_create_owner_employee_for_founder on public.profiles;
create trigger trg_create_owner_employee_for_founder
  after insert on public.profiles
  for each row execute function public.create_owner_employee_for_founder();
