-- client_bulk_edit was enforced only by hiding the "Bulk Edit Field" menu item
-- in ClientsTable.tsx; the bulk edit itself is a plain
-- `update clients set <field> = <value> where id in (...)` from the browser, so
-- any login with client_allow_edit could run it for hundreds of clients.
--
-- A statement-level AFTER UPDATE trigger now rejects a single UPDATE statement
-- that changes any of the bulk-editable fields (account_type, source,
-- priority, ok_to_email, do_not_market, or status -> 'inactive') on MORE THAN
-- ONE client unless the caller has client_bulk_edit. Single-row edits
-- (client_allow_edit) are untouched, as are the dedicated bulk Cancel /
-- Activate / Close-as-lost actions (they set status to cancelled / active /
-- lost, never 'inactive', and touch none of the other fields).
--
-- Exempt: no end-user session (auth.uid() is null: service role, webhooks,
-- cron, automations, /api/v1) and admins (has_settings_permission passes
-- profiles.role = 'admin'). Checked against every multi-row clients update in
-- src/: the only user-session one is useBulkUpdateClients.
create or replace function public.enforce_client_bulk_edit_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_changed integer;
begin
  if auth.uid() is null then
    return null;
  end if;

  select count(*) into v_changed
  from old_rows o
  join new_rows n on n.id = o.id
  where (o.account_type, o.source, o.priority, o.ok_to_email, o.do_not_market)
        is distinct from
        (n.account_type, n.source, n.priority, n.ok_to_email, n.do_not_market)
     or (o.status is distinct from 'inactive' and n.status = 'inactive');

  if v_changed > 1 and not public.has_settings_permission('client_bulk_edit') then
    raise exception 'You do not have permission to bulk edit clients'
      using errcode = '42501';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_clients_enforce_bulk_edit on public.clients;
create trigger trg_clients_enforce_bulk_edit
  after update on public.clients
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function public.enforce_client_bulk_edit_permission();
