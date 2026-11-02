-- estimate_milestones now require crm_roles keys when written straight from an
-- end-user session (exemptions in 20261207000100: service role, SECURITY
-- DEFINER RPCs — create_invoice_from_milestone, approve/reverse_change_order —
-- trigger cascades such as fn_crm_jobs_adopt_milestones and
-- release_milestone_on_invoice_void; admins always pass).
--
-- One table serves two surfaces: an estimate's Payment Plan tab and a
-- project's Billing Schedule. A row is a PROJECT row when it carries a
-- project_id (before or after the write), or will get one from
-- trg_estimate_milestones_link_project (an estimate already converted to a
-- project). Everything else is an ESTIMATE row.
--
--  project rows        sched_add_modify_projects or acct_add_modify_invoices
--                      (the Projects milestone tab has been editable with
--                      the invoice key; Scheduler holds the project key)
--  estimate rows       estimate_edit, or estimate_add on an unsent estimate
--                      the caller created (same rule as the estimate's line
--                      items: New Estimate, Duplicate)
--  convert             job_add or sched_add_modify_projects may stamp
--                      project_id onto an estimate row, and change nothing
--                      else, when that project is on a job converted from the
--                      same estimate (useCreateJobsFromEstimate)
--  invoice repoint     acct_add_modify_invoices may change only invoice_id /
--                      status (crm_merge_invoices / crm_consolidate_invoices
--                      run as the caller and move milestones to the
--                      surviving invoice)
--
-- The trigger is named a_* so it fires before
-- trg_estimate_milestones_link_project and sees the user's own change.
create or replace function public.enforce_estimate_milestone_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new_project uuid;
  v_estimate_ids uuid[];
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op <> 'DELETE' then
    v_new_project := new.project_id;
    -- Mirror trg_estimate_milestones_link_project: a row added to (or moved
    -- onto) an estimate that was converted to a project lands on the project.
    if v_new_project is null and new.estimate_id is not null
       and (tg_op = 'INSERT'
            or new.estimate_id is distinct from old.estimate_id
            or old.project_id is not null) then
      select j.project_id into v_new_project
      from public.crm_jobs j
      where j.estimate_id = new.estimate_id
        and j.project_id is not null
        and j.deleted_at is null
      limit 1;
    end if;
  end if;

  if tg_op = 'UPDATE'
     and public.has_settings_permission('acct_add_modify_invoices')
     and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new),
           array['invoice_id', 'status']) then
    return new;
  end if;

  if v_new_project is not null
     or (tg_op <> 'INSERT' and old.project_id is not null) then
    if public._crm_has_any_permission(
         array['sched_add_modify_projects', 'acct_add_modify_invoices']) then
      return coalesce(new, old);
    end if;

    if tg_op = 'UPDATE'
       and old.project_id is null
       and new.project_id is not null
       and public._crm_has_any_permission(array['job_add', 'sched_add_modify_projects'])
       and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new), array['project_id'])
       and exists (
         select 1 from public.crm_jobs j
         where j.estimate_id = old.estimate_id
           and j.project_id = new.project_id
           and j.deleted_at is null
       ) then
      return new;
    end if;

    raise exception 'You do not have permission to edit project billing milestones'
      using errcode = '42501';
  end if;

  if public.has_settings_permission('estimate_edit') then
    return coalesce(new, old);
  end if;

  if public.has_settings_permission('estimate_add') then
    v_estimate_ids := array_remove(array[
      case when tg_op = 'DELETE' then null else new.estimate_id end,
      case when tg_op = 'INSERT' then null else old.estimate_id end], null);
    if coalesce(array_length(v_estimate_ids, 1), 0) > 0
       and not exists (
         select 1 from unnest(v_estimate_ids) e(id)
         where not public._estimate_is_own_unsent_draft(e.id)
       ) then
      return coalesce(new, old);
    end if;
  end if;

  raise exception 'You do not have permission to edit estimates'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_estimate_milestones_enforce_write_permission on public.estimate_milestones;
create trigger a_estimate_milestones_enforce_write_permission
  before insert or update or delete on public.estimate_milestones
  for each row
  execute function public.enforce_estimate_milestone_write_permission();
