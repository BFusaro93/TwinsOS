-- Maintenance requests: who may change what (owner decision, round 11).
--
--   * Requestor and purchaser ("limited" Equipt roles for requests) may edit
--     only the title, description, priority and asset/vehicle of their OWN
--     request, and only while it is still 'open'. Soft delete (deleted_at)
--     follows the same rule. Everything else — status, linked work order,
--     automation, assignee — is triage, done by the roles that can triage
--     (admin / manager / technician / crew; the UI's canTriageMaintenanceRequests).
--   * On INSERT a limited role can't file a request as anything but 'open',
--     and can't set triage fields or credit it to someone else.
--   * For EVERY end-user session: once a request is linked to a work order its
--     status is frozen (the conversion flow links in the same write that sets
--     'converted', so it is unaffected).
--
-- The role_write_guard_* RLS policies already confine requestors to their own
-- rows; they can't express "which columns" or "only while open", hence this
-- BEFORE trigger. It only acts on direct end-user writes
-- (_crm_direct_user_write(): an authenticated/anon session, not inside a
-- SECURITY DEFINER function, not a cascade from another trigger) — service
-- role (portal submit, automations, cron), SECURITY DEFINER RPCs and the
-- unit-retirement trigger (20261231000730) pass through untouched.
-- Must stay SECURITY INVOKER: _crm_direct_user_write() keys on current_user.

create or replace function public.maintenance_requests_limited_role_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role text;
begin
  if not public._crm_direct_user_write() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Any role: a request already linked to a work order keeps its status.
  if tg_op = 'UPDATE'
     and old.linked_work_order_id is not null
     and new.status is distinct from old.status then
    raise exception 'This request is linked to work order % — its status can''t be changed.',
      coalesce(old.linked_work_order_number, '')
      using errcode = '42501';
  end if;

  v_role := coalesce(public.my_role(), '');
  if v_role not in ('requestor', 'purchaser') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'open'
       or new.automation_id is not null
       or new.linked_work_order_id is not null
       or new.linked_work_order_number is not null
       or new.assigned_to_id is not null
       or new.assigned_to_name is not null then
      raise exception 'New requests start as Open; review fields are set by whoever triages requests.'
        using errcode = '42501';
    end if;
    if new.requested_by_id is not null and new.requested_by_id is distinct from auth.uid() then
      raise exception 'You can only submit requests as yourself.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE / DELETE: own request, still open, not already deleted.
  if not (old.created_by = auth.uid() or old.requested_by_id = auth.uid()) then
    raise exception 'You can only change your own requests.' using errcode = '42501';
  end if;
  if old.status is distinct from 'open' or old.deleted_at is not null then
    raise exception 'This request is already being reviewed and can no longer be changed or deleted.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if public._crm_changed_outside(
       to_jsonb(old), to_jsonb(new),
       array['title', 'description', 'priority', 'asset_id', 'asset_name', 'deleted_at']
     ) then
    raise exception 'You can change only the title, description, priority and asset/vehicle of your request.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.maintenance_requests_limited_role_guard() from public, anon, authenticated;

drop trigger if exists trg_maintenance_requests_limited_role_guard on public.maintenance_requests;
create trigger trg_maintenance_requests_limited_role_guard
  before insert or update or delete on public.maintenance_requests
  for each row execute function public.maintenance_requests_limited_role_guard();
