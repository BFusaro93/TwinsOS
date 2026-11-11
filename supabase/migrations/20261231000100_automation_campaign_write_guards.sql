-- Security hotfix (bug sweep round 11): campaigns and automation internals
-- could be written by any login with Landscapt access, including a shared
-- crew login with no campaign or automation permission.
--
-- 1. crm_campaigns had a guard on UPDATE only. A direct INSERT of a campaign
--    with status 'scheduled' and a past scheduled_at was picked up by the
--    scheduled-campaigns cron (service role) and emailed to every client.
--    Inserts now need campaign_add, and campaign_send unless the row starts
--    as a draft. Hard deletes need campaign_delete.
-- 2. The automation builder's child tables (steps, triggers, trigger and stop
--    conditions) only checked org + has_crm_access, while their parents
--    (crm_automations, crm_automation_sequences) need automation_create_modify.
--    They now use the same keyed guard as the parents.
-- 3. crm_sequence_step_approvals could be inserted or rewritten freely: a
--    forged 'approved' row with any to_email / body_html was sent verbatim by
--    the sequence processor. Rows are now created only by the system (service
--    role / SECURITY DEFINER RPCs). A user session may only record the
--    decision (status, decided_by, decided_at) and only as an approver
--    (admin/manager role or automation_create_modify), matching
--    /api/crm/automations/approvals/[id].
--
-- Server paths (service role, cron, SECURITY DEFINER RPCs such as
-- crm_merge_clients, cascades from other triggers) are untouched: every guard
-- starts with _crm_direct_user_write().

-- 1. Campaigns ---------------------------------------------------------------
create or replace function public.enforce_campaign_insert_delete_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if public.has_settings_permission('campaign_delete') then
      return old;
    end if;
    raise exception 'You do not have permission to delete campaigns'
      using errcode = '42501';
  end if;

  if not public.has_settings_permission('campaign_add') then
    raise exception 'You do not have permission to add campaigns'
      using errcode = '42501';
  end if;
  if new.status is distinct from 'draft'
     and not public.has_settings_permission('campaign_send') then
    raise exception 'You do not have permission to schedule or send campaigns'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_campaigns_enforce_insert_delete on public.crm_campaigns;
create trigger trg_crm_campaigns_enforce_insert_delete
  before insert or delete on public.crm_campaigns
  for each row execute function public.enforce_campaign_insert_delete_permission();

-- 2. Automation builder child tables ----------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'crm_sequence_events',
    'crm_sequence_triggers',
    'crm_sequence_trigger_conditions',
    'crm_sequence_stop_conditions'
  ] loop
    execute format('drop trigger if exists a_%1$s_enforce_write_permission on public.%1$I', t);
    execute format(
      'create trigger a_%1$s_enforce_write_permission
         before insert or update or delete on public.%1$I
         for each row execute function public.enforce_crm_keyed_write_permission(
           %2$L, %3$L, %3$L, %3$L)',
      t, 'automations', 'automation_create_modify');
  end loop;
end;
$$;

-- 3. Step approvals -----------------------------------------------------------
create or replace function public.enforce_sequence_step_approval_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op <> 'UPDATE' then
    raise exception 'Automation step approvals are created and removed by the system'
      using errcode = '42501';
  end if;

  if not (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager')
    )
    or public.has_settings_permission('automation_create_modify')
  ) then
    raise exception 'You need the Create/Modify Automation permission to approve automation steps'
      using errcode = '42501';
  end if;

  if public._crm_changed_outside(
       to_jsonb(old), to_jsonb(new),
       array['status', 'decided_by', 'decided_at', 'updated_at']) then
    raise exception 'Only the approve/reject decision can be changed on a queued automation step'
      using errcode = '42501';
  end if;

  if new.decided_by is not null and new.decided_by is distinct from auth.uid() then
    raise exception 'An approval can only be recorded as yourself'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists a_crm_sequence_step_approvals_enforce_write on public.crm_sequence_step_approvals;
create trigger a_crm_sequence_step_approvals_enforce_write
  before insert or update or delete on public.crm_sequence_step_approvals
  for each row execute function public.enforce_sequence_step_approval_write();

revoke all on function public.enforce_campaign_insert_delete_permission() from public, anon;
revoke all on function public.enforce_sequence_step_approval_write() from public, anon;
