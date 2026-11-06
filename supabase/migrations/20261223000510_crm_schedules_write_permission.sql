-- crm_schedules writes now need the Settings → "Scheduling Settings" key
-- (scheduling_settings) when they come straight from an end-user session.
-- RLS stays org + has_crm_access for reads; before this any CRM seat
-- (including a crew login) could edit, switch off or delete the org's
-- schedules from the browser console, and every job on that schedule follows
-- it. Same exemptions as the other crm_roles guards (20261207000100):
-- service role, cron, /api/v1, SECURITY DEFINER RPCs and trigger cascades
-- pass; admins always pass inside has_settings_permission.
--
--  insert         scheduling_settings, or job_add (Job Detail's
--                 "+ Create new schedule…" while editing a recurring job)
--  update/delete  scheduling_settings (includes rename, on/off switch, and
--                 soft delete)
create or replace function public.enforce_crm_schedule_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if public._crm_has_any_permission(array['scheduling_settings', 'job_add']) then
      return new;
    end if;
    raise exception 'You do not have permission to add schedules'
      using errcode = '42501';
  end if;

  if public.has_settings_permission('scheduling_settings') then
    return coalesce(new, old);
  end if;
  raise exception 'You do not have permission to edit schedules'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_crm_schedules_enforce_write_permission on public.crm_schedules;
create trigger a_crm_schedules_enforce_write_permission
  before insert or update or delete on public.crm_schedules
  for each row
  execute function public.enforce_crm_schedule_write_permission();
