-- Crew logins: client timeline = only the entries the crew wrote; no client contacts.
--
-- 20270103000120 limited crew reads of client_activity and client_contacts to
-- clients on the crew's own visits. Nothing on the crew side reads either for
-- those clients: the crew app never shows a client timeline or contact list.
-- It only ADDS timeline entries (visit notes, skips, upsell suggestions, need
-- help, hand-offs, pushes) and reads back its own note entries to avoid logging
-- a retried note twice. Stop screens get the client's name / primary phone from
-- clients and the address / gate code / notes to crew from client_properties,
-- which keep the "clients on my visits" rule.
--
-- So for role 'crew':
--   client_activity  SELECT: only rows with created_by = auth.uid()
--                    INSERT: unchanged (own rows, clients on my visits)
--   client_contacts  SELECT: none
-- Every other role is unaffected (RESTRICTIVE, keyed on my_role() = 'crew').
-- The security-invoker report views rpt_client_activity / rpt_client_contacts
-- follow automatically.
--
-- PROD: before or after the code deploy — no code reads these rows as crew.

drop policy if exists crew_scope_client_activity_select on public.client_activity;
create policy crew_scope_client_activity_select on public.client_activity
  as restrictive for select
  using (
    (select public.my_role()) is distinct from 'crew'
    or created_by = (select auth.uid())
  );

drop policy if exists crew_scope_client_contacts_select on public.client_contacts;
create policy crew_scope_client_contacts_select on public.client_contacts
  as restrictive for select
  using ((select public.my_role()) is distinct from 'crew');

notify pgrst, 'reload schema';
