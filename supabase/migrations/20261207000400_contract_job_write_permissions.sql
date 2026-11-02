-- Contracts and job creation now require their crm_roles keys when written
-- straight from an end-user session (exemptions in 20261207000100: service
-- role — /api/v1, cron contract invoicing and expiry notices, portal/e-sign —
-- SECURITY DEFINER RPCs, trigger cascades; admins always pass).
--
--  crm_contracts insert          contract_add (created_by is stamped)
--  crm_contracts update          contract_edit, or
--    * contract_add on a draft the caller created (finishing a new contract)
--    * contract_create_invoices when only last_billed_date /
--      first_period_prorated_at change (Generate Invoices stamps them)
--  crm_contracts soft delete     contract_delete (deleted_at set); a
--    / hard delete               contract_add holder may also discard a draft
--                                they created
--  crm_contract_services         contract_edit, or contract_add on a draft the
--                                caller created
--  crm_contract_templates        contract_add or contract_edit (saved from the
--                                contract dialog)
--  crm_jobs insert               job_add; a project-type job also passes with
--                                sched_add_modify_projects. Job updates have
--                                no key (job_cancel is enforced by
--                                trg_crm_jobs_enforce_cancel) and visits stay
--                                on has_crm_access for the crew app.
create or replace function public.enforce_crm_contract_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_own_draft boolean;
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    if public.has_settings_permission('contract_add') then
      return new;
    end if;
    raise exception 'You do not have permission to add contracts'
      using errcode = '42501';
  end if;

  v_own_draft := old.status = 'draft'
    and old.created_by = auth.uid()
    and public.has_settings_permission('contract_add');

  if tg_op = 'DELETE'
     or (new.deleted_at is not null and old.deleted_at is null) then
    if v_own_draft or public.has_settings_permission('contract_delete') then
      return coalesce(new, old);
    end if;
    raise exception 'You do not have permission to delete contracts'
      using errcode = '42501';
  end if;

  if public.has_settings_permission('contract_edit')
     or (v_own_draft and new.created_by is not distinct from old.created_by) then
    return new;
  end if;

  if public.has_settings_permission('contract_create_invoices')
     and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new),
           array['last_billed_date', 'first_period_prorated_at']) then
    return new;
  end if;

  raise exception 'You do not have permission to edit contracts'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_crm_contracts_enforce_write_permission on public.crm_contracts;
create trigger a_crm_contracts_enforce_write_permission
  before insert or update or delete on public.crm_contracts
  for each row
  execute function public.enforce_crm_contract_write_permission();

create or replace function public.enforce_crm_contract_service_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_contract_ids uuid[];
begin
  if not public._crm_direct_user_write()
     or public.has_settings_permission('contract_edit') then
    return coalesce(new, old);
  end if;

  v_contract_ids := case tg_op
    when 'INSERT' then array[new.contract_id]
    when 'DELETE' then array[old.contract_id]
    else array[new.contract_id, old.contract_id]
  end;

  if public.has_settings_permission('contract_add')
     and not exists (
       select 1 from unnest(v_contract_ids) c(id)
       where not exists (
         select 1 from public.crm_contracts k
         where k.id = c.id
           and k.status = 'draft'
           and k.created_by = auth.uid()
           and k.deleted_at is null
       )
     ) then
    return coalesce(new, old);
  end if;

  raise exception 'You do not have permission to edit contracts'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_crm_contract_services_enforce_write_permission on public.crm_contract_services;
create trigger a_crm_contract_services_enforce_write_permission
  before insert or update or delete on public.crm_contract_services
  for each row
  execute function public.enforce_crm_contract_service_write_permission();

create or replace function public.enforce_crm_contract_template_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public._crm_direct_user_write()
     or public._crm_has_any_permission(array['contract_add', 'contract_edit']) then
    return coalesce(new, old);
  end if;
  raise exception 'You do not have permission to manage contract templates'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_crm_contract_templates_enforce_write_permission on public.crm_contract_templates;
create trigger a_crm_contract_templates_enforce_write_permission
  before insert or update or delete on public.crm_contract_templates
  for each row
  execute function public.enforce_crm_contract_template_write_permission();

create or replace function public.enforce_crm_job_insert_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public._crm_direct_user_write()
     or public.has_settings_permission('job_add')
     or (new.job_type = 'project'
         and public.has_settings_permission('sched_add_modify_projects')) then
    return new;
  end if;
  raise exception 'You do not have permission to add jobs'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_crm_jobs_enforce_insert_permission on public.crm_jobs;
create trigger a_crm_jobs_enforce_insert_permission
  before insert on public.crm_jobs
  for each row
  execute function public.enforce_crm_job_insert_permission();
