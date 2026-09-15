-- Reportable view over crm_tickets, for the Operations Dashboard's Tickets
-- tab (Open Tickets by Category/Assignee charts) and any future ticket report.
create or replace view rpt_tickets
with (security_invoker = on) as
select
  t.id,
  t.ticket_number,
  t.type,
  t.status,
  t.priority,
  t.subject,
  t.category,
  c.display_name as client_name,
  t.assigned_to,
  t.due_date,
  t.closed_at,
  t.created_at
from crm_tickets t
left join clients c on c.id = t.client_id and c.deleted_at is null
where t.deleted_at is null;
