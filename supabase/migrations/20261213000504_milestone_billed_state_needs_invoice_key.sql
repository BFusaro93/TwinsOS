-- estimate_milestones write guard (20261209000100): a milestone's billed state
-- (status, invoice_id) now needs acct_add_modify_invoices on every row.
-- sched_add_modify_projects (project rows) and estimate_edit (estimate rows)
-- allowed any change, so a Scheduler could set an invoiced milestone back to
-- pending and clear its invoice — and bill it a second time. No UI writes those
-- columns from a user session (invoicing is create_invoice_from_milestone, a
-- SECURITY DEFINER RPC; Duplicate inserts pending/null). Restated from
-- 20261209000100 with only that check added.
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

  -- Whether a milestone is billed (status / invoice_id) is the invoice key's
  -- alone, on project and estimate rows alike. The project and estimate keys
  -- below allow "any change" to their rows, which let a Scheduler set an
  -- invoiced milestone back to pending with no invoice — billable again.
  -- Invoicing itself goes through create_invoice_from_milestone (DEFINER) and
  -- merges/voids through the invoice-key RPCs and triggers, all exempt above.
  if not public.has_settings_permission('acct_add_modify_invoices')
     and ((tg_op = 'UPDATE'
           and (new.invoice_id is distinct from old.invoice_id
                or new.status is distinct from old.status))
          or (tg_op = 'INSERT'
              and (new.invoice_id is not null
                   or coalesce(new.status, 'pending') <> 'pending'))) then
    raise exception 'Only someone who can modify invoices can change whether a milestone is invoiced'
      using errcode = '42501';
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
