-- crm_tickets.assigned_to is a free-text "First Last" name — fine for
-- display, but unreliable for anything that needs to actually notify the
-- assignee (typos, duplicate names, employees never linked to a login).
-- Add a real FK alongside it, following the same pattern already used on
-- work_orders/pm_schedules (assigned_to_id + assigned_to_name).
alter table crm_tickets
  add column if not exists assigned_to_id uuid references profiles(id);

-- One-time backfill for existing rows — same case-insensitive/trimmed
-- first+last name match already used at query time in
-- src/lib/ticket-notify.ts's resolveAssigneeUserId(). Ambiguous/no-match
-- rows are simply left null, same as that function's existing behavior.
update crm_tickets t
set assigned_to_id = e.user_id
from crm_employees e
where t.assigned_to is not null
  and t.assigned_to_id is null
  and e.user_id is not null
  and e.deleted_at is null
  and lower(trim(e.first_name || ' ' || e.last_name)) = lower(trim(t.assigned_to));
