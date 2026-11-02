-- Automations, document templates, packages and teams now require their
-- crm_roles keys when written straight from an end-user session (exemptions in
-- 20261207000100; admins always pass).
--
--  crm_automations,              automation_create_modify; automation_stop
--  crm_automation_sequences      alone may flip is_active (the Enabled switches)
--  crm_document_templates        insert document_template_add, soft delete
--                                document_template_delete, other updates
--                                document_template_edit; an add holder may
--                                discard a template they created (New / Copy
--                                roll back when the blocks fail to save)
--  crm_document_blocks           document_template_edit, or
--                                document_template_add on a template the
--                                caller created
--  crm_packages                  insert package_add, soft delete
--                                package_delete, other updates package_edit
--  crm_package_services          package_edit, or package_add on a package the
--                                caller created
--  crm_crews                     sched_teams (Teams page). The crew-login
--                                route links crews as the service role.
--  crm_crew_members              sched_teams; inserts also pass with
--                                sched_dispatch_board (the dispatch board's
--                                time editor adds an off-roster employee)
--  crm_crew_default_assets       sched_teams or sched_dispatch_board (Crew
--                                Board)
-- Daily crew tables (crm_crew_daily_*, day shifts, member times, route order)
-- are dispatch / crew-app data and stay on has_crm_access.

-- Generic "one key per operation" guard, configured per table through trigger
-- arguments: a label for the error message, the insert key, the update key,
-- the soft/hard-delete key, and optionally a comma-separated list of columns
-- that one more key (the last argument) may change on its own.
create or replace function public.enforce_crm_keyed_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_label text := tg_argv[0];
  v_insert_key text := tg_argv[1];
  v_update_key text := tg_argv[2];
  v_delete_key text := tg_argv[3];
  v_narrow_cols text[] := case when tg_nargs > 4 then string_to_array(tg_argv[4], ',') end;
  v_narrow_key text := case when tg_nargs > 5 then tg_argv[5] end;
  v_old jsonb;
  v_new jsonb;
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if (to_jsonb(new) ? 'created_by') and (to_jsonb(new) ->> 'created_by') is null then
      new := jsonb_populate_record(new, jsonb_build_object('created_by', auth.uid()));
    end if;
    if public.has_settings_permission(v_insert_key) then
      return new;
    end if;
    raise exception 'You do not have permission to add %', v_label
      using errcode = '42501';
  end if;

  v_old := to_jsonb(old);
  if tg_op = 'UPDATE' then
    v_new := to_jsonb(new);
  end if;

  if tg_op = 'DELETE'
     or ((v_new ->> 'deleted_at') is not null and (v_old ->> 'deleted_at') is null) then
    if public.has_settings_permission(v_delete_key) then
      return coalesce(new, old);
    end if;
    raise exception 'You do not have permission to delete %', v_label
      using errcode = '42501';
  end if;

  if public.has_settings_permission(v_update_key) then
    return new;
  end if;

  if v_narrow_key is not null
     and public.has_settings_permission(v_narrow_key)
     and not public._crm_changed_outside(v_old, v_new, v_narrow_cols) then
    return new;
  end if;

  raise exception 'You do not have permission to edit %', v_label
    using errcode = '42501';
end;
$$;

-- Automations: one key for everything, automation_stop for the switches.
do $$
declare
  t text;
begin
  foreach t in array array['crm_automations', 'crm_automation_sequences'] loop
    execute format('drop trigger if exists a_%1$s_enforce_write_permission on public.%1$I', t);
    execute format(
      'create trigger a_%1$s_enforce_write_permission
         before insert or update or delete on public.%1$I
         for each row execute function public.enforce_crm_keyed_write_permission(
           %2$L, %3$L, %3$L, %3$L, %4$L, %5$L)',
      t, 'automations', 'automation_create_modify', 'is_active', 'automation_stop');
  end loop;
end;
$$;

-- Document templates. The add-holder discard carve-out is a separate check
-- because the generic guard has no notion of ownership.
create or replace function public.enforce_crm_document_template_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE'
     and new.deleted_at is not null and old.deleted_at is null
     and old.created_by = auth.uid()
     and public.has_settings_permission('document_template_add')
     and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new), array['deleted_at']) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    if public.has_settings_permission('document_template_add') then
      return new;
    end if;
    raise exception 'You do not have permission to add document templates'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE'
     or (new.deleted_at is not null and old.deleted_at is null) then
    if public.has_settings_permission('document_template_delete') then
      return coalesce(new, old);
    end if;
    raise exception 'You do not have permission to delete document templates'
      using errcode = '42501';
  end if;

  if public.has_settings_permission('document_template_edit') then
    return new;
  end if;
  raise exception 'You do not have permission to edit document templates'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_crm_document_templates_enforce_write_permission on public.crm_document_templates;
create trigger a_crm_document_templates_enforce_write_permission
  before insert or update or delete on public.crm_document_templates
  for each row
  execute function public.enforce_crm_document_template_write_permission();

-- Children of an owned parent: <child>.<fk> -> <parent>.id, passing with
-- edit_key, or with add_key when every parent touched was created by the
-- caller. Arguments: label, edit key, add key, fk column, parent table.
create or replace function public.enforce_crm_owned_child_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_label text := tg_argv[0];
  v_edit_key text := tg_argv[1];
  v_add_key text := tg_argv[2];
  v_fk text := tg_argv[3];
  v_parent regclass := tg_argv[4]::regclass;
  v_parent_ids uuid[];
  v_all_own boolean;
begin
  if not public._crm_direct_user_write()
     or public.has_settings_permission(v_edit_key) then
    return coalesce(new, old);
  end if;

  v_parent_ids := array_remove(array[
    case when tg_op <> 'DELETE' then (to_jsonb(new) ->> v_fk)::uuid end,
    case when tg_op <> 'INSERT' then (to_jsonb(old) ->> v_fk)::uuid end
  ], null);

  if public.has_settings_permission(v_add_key)
     and coalesce(array_length(v_parent_ids, 1), 0) > 0 then
    execute format(
      'select count(*) = cardinality($1) from (select distinct id from %s
         where id = any($1) and created_by = auth.uid()) p', v_parent)
      into v_all_own
      using (select array_agg(distinct x) from unnest(v_parent_ids) x);
    if v_all_own then
      return coalesce(new, old);
    end if;
  end if;

  raise exception 'You do not have permission to edit %', v_label
    using errcode = '42501';
end;
$$;

drop trigger if exists a_crm_document_blocks_enforce_write_permission on public.crm_document_blocks;
create trigger a_crm_document_blocks_enforce_write_permission
  before insert or update or delete on public.crm_document_blocks
  for each row
  execute function public.enforce_crm_owned_child_write_permission(
    'document templates', 'document_template_edit', 'document_template_add', 'template_id', 'public.crm_document_templates');

-- Packages.
drop trigger if exists a_crm_packages_enforce_write_permission on public.crm_packages;
create trigger a_crm_packages_enforce_write_permission
  before insert or update or delete on public.crm_packages
  for each row
  execute function public.enforce_crm_keyed_write_permission(
    'packages', 'package_add', 'package_edit', 'package_delete');

drop trigger if exists a_crm_package_services_enforce_write_permission on public.crm_package_services;
create trigger a_crm_package_services_enforce_write_permission
  before insert or update or delete on public.crm_package_services
  for each row
  execute function public.enforce_crm_owned_child_write_permission(
    'packages', 'package_edit', 'package_add', 'package_id', 'public.crm_packages');

-- Teams.
drop trigger if exists a_crm_crews_enforce_write_permission on public.crm_crews;
create trigger a_crm_crews_enforce_write_permission
  before insert or update or delete on public.crm_crews
  for each row
  execute function public.enforce_crm_keyed_write_permission(
    'teams', 'sched_teams', 'sched_teams', 'sched_teams');

create or replace function public.enforce_crm_crew_roster_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public._crm_direct_user_write()
     or public.has_settings_permission('sched_teams')
     or ((tg_op = 'INSERT' or tg_table_name = 'crm_crew_default_assets')
         and public.has_settings_permission('sched_dispatch_board')) then
    return coalesce(new, old);
  end if;
  raise exception 'You do not have permission to manage teams'
    using errcode = '42501';
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['crm_crew_members', 'crm_crew_default_assets'] loop
    execute format('drop trigger if exists a_%1$s_enforce_write_permission on public.%1$I', t);
    execute format(
      'create trigger a_%1$s_enforce_write_permission
         before insert or update or delete on public.%1$I
         for each row execute function public.enforce_crm_crew_roster_write_permission()', t);
  end loop;
end;
$$;
