-- Tighten RLS on core CRM/Landscapt tables: org_id scoping alone let any
-- active, authenticated org member read/write client, job, and financial
-- data via a direct API call even if their profile has no linked
-- crm_employees/crm_roles record — the (crm) route group's own UI gate
-- (useCrmAccess) already refuses these users the app's CRM pages, but the
-- database itself never enforced the same rule. Adding `has_crm_access()`
-- closes that gap: admins and crew keep exactly the access they have today
-- (has_crm_access() returns true for both unconditionally — crew has no
-- crm_employees link on this system today and is governed by its own
-- narrower per-table policies elsewhere), while an active user without a
-- live employee/role link on a non-admin, non-crew profile is now blocked
-- at the database layer too, not just in the UI.
--
-- Crew-scoped policies (e.g. "crew can read own assigned clients", "crew
-- members see own visits") and client-portal policies are untouched.

-- ---------------------------------------------------------------------
-- client_activity
-- ---------------------------------------------------------------------
drop policy if exists "org members can insert client_activity" on public.client_activity;
create policy "org members can insert client_activity" on public.client_activity
  for insert
  with check (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

drop policy if exists "org members can read client_activity" on public.client_activity;
create policy "org members can read client_activity" on public.client_activity
  for select
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

drop policy if exists "org members can update client_activity" on public.client_activity;
create policy "org members can update client_activity" on public.client_activity
  for update
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

-- ---------------------------------------------------------------------
-- client_contacts
-- ---------------------------------------------------------------------
drop policy if exists "org members can insert client_contacts" on public.client_contacts;
create policy "org members can insert client_contacts" on public.client_contacts
  for insert
  with check (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

drop policy if exists "org members can read client_contacts" on public.client_contacts;
create policy "org members can read client_contacts" on public.client_contacts
  for select
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

drop policy if exists "org members can update client_contacts" on public.client_contacts;
create policy "org members can update client_contacts" on public.client_contacts
  for update
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

-- ---------------------------------------------------------------------
-- client_properties
-- ---------------------------------------------------------------------
drop policy if exists "org members can insert client_properties" on public.client_properties;
create policy "org members can insert client_properties" on public.client_properties
  for insert
  with check (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

drop policy if exists "org members can read client_properties" on public.client_properties;
create policy "org members can read client_properties" on public.client_properties
  for select
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

drop policy if exists "org members can update client_properties" on public.client_properties;
create policy "org members can update client_properties" on public.client_properties
  for update
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

-- ---------------------------------------------------------------------
-- clients (crew-own-assigned + portal policies untouched)
-- ---------------------------------------------------------------------
drop policy if exists "non-crew org members can read clients" on public.clients;
create policy "non-crew org members can read clients" on public.clients
  for select
  using (
    org_id = public.my_org_id()
    and public.my_role() is distinct from 'crew'
    and public.has_crm_access()
  );

drop policy if exists "org members can insert clients" on public.clients;
create policy "org members can insert clients" on public.clients
  for insert
  with check (
    org_id = public.my_org_id()
    and public.has_crm_access()
  );

drop policy if exists "org members can update clients" on public.clients;
create policy "org members can update clients" on public.clients
  for update
  using (
    org_id = public.my_org_id()
    and public.has_crm_access()
  );

-- ---------------------------------------------------------------------
-- crm_contracts
-- ---------------------------------------------------------------------
drop policy if exists "crm_contracts_insert" on public.crm_contracts;
create policy "crm_contracts_insert" on public.crm_contracts
  for insert
  with check (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

drop policy if exists "crm_contracts_select" on public.crm_contracts;
create policy "crm_contracts_select" on public.crm_contracts
  for select
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

drop policy if exists "crm_contracts_update" on public.crm_contracts;
create policy "crm_contracts_update" on public.crm_contracts
  for update
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

-- ---------------------------------------------------------------------
-- crm_invoice_line_items
-- ---------------------------------------------------------------------
drop policy if exists "crm_invoice_items_delete" on public.crm_invoice_line_items;
create policy "crm_invoice_items_delete" on public.crm_invoice_line_items
  for delete
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

drop policy if exists "crm_invoice_items_insert" on public.crm_invoice_line_items;
create policy "crm_invoice_items_insert" on public.crm_invoice_line_items
  for insert
  with check (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.my_role() is distinct from 'crew'
    and public.has_crm_access()
  );

drop policy if exists "crm_invoice_items_select" on public.crm_invoice_line_items;
create policy "crm_invoice_items_select" on public.crm_invoice_line_items
  for select
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.my_role() is distinct from 'crew'
    and public.has_crm_access()
  );

drop policy if exists "crm_invoice_items_update" on public.crm_invoice_line_items;
create policy "crm_invoice_items_update" on public.crm_invoice_line_items
  for update
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.my_role() is distinct from 'crew'
    and public.has_crm_access()
  );

-- ---------------------------------------------------------------------
-- crm_invoices (portal policy untouched)
-- ---------------------------------------------------------------------
drop policy if exists "crm_invoices_insert" on public.crm_invoices;
create policy "crm_invoices_insert" on public.crm_invoices
  for insert
  with check (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.my_role() is distinct from 'crew'
    and public.has_crm_access()
  );

drop policy if exists "crm_invoices_select" on public.crm_invoices;
create policy "crm_invoices_select" on public.crm_invoices
  for select
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.my_role() is distinct from 'crew'
    and public.has_crm_access()
  );

drop policy if exists "crm_invoices_update" on public.crm_invoices;
create policy "crm_invoices_update" on public.crm_invoices
  for update
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.my_role() is distinct from 'crew'
    and public.has_crm_access()
  );

-- ---------------------------------------------------------------------
-- crm_jobs
-- ---------------------------------------------------------------------
drop policy if exists "org members can insert crm_jobs" on public.crm_jobs;
create policy "org members can insert crm_jobs" on public.crm_jobs
  for insert
  with check (
    org_id = public.my_org_id()
    and public.has_crm_access()
  );

drop policy if exists "org members can read crm_jobs" on public.crm_jobs;
create policy "org members can read crm_jobs" on public.crm_jobs
  for select
  using (
    org_id = public.my_org_id()
    and public.has_crm_access()
  );

drop policy if exists "org members can update crm_jobs" on public.crm_jobs;
create policy "org members can update crm_jobs" on public.crm_jobs
  for update
  using (
    org_id = public.my_org_id()
    and public.has_crm_access()
  );

-- ---------------------------------------------------------------------
-- crm_job_visits (crew-own-visits + portal policies untouched)
-- ---------------------------------------------------------------------
drop policy if exists "org members manage visits" on public.crm_job_visits;
create policy "org members manage visits" on public.crm_job_visits
  for all
  using (
    org_id = public.my_org_id()
    and public.has_crm_access()
  )
  with check (
    org_id = public.my_org_id()
    and public.has_crm_access()
  );

-- ---------------------------------------------------------------------
-- crm_tickets (portal policies untouched)
-- ---------------------------------------------------------------------
drop policy if exists "org members can insert tickets" on public.crm_tickets;
create policy "org members can insert tickets" on public.crm_tickets
  for insert
  with check (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

drop policy if exists "org members can select tickets" on public.crm_tickets;
create policy "org members can select tickets" on public.crm_tickets
  for select
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

drop policy if exists "org members can update tickets" on public.crm_tickets;
create policy "org members can update tickets" on public.crm_tickets
  for update
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.has_crm_access()
  );

-- ---------------------------------------------------------------------
-- crm_ticket_links
-- ---------------------------------------------------------------------
drop policy if exists "org members manage ticket_links" on public.crm_ticket_links;
create policy "org members manage ticket_links" on public.crm_ticket_links
  for all
  using (
    org_id = public.my_org_id()
    and public.has_crm_access()
  )
  with check (
    org_id = public.my_org_id()
    and public.has_crm_access()
  );

-- ---------------------------------------------------------------------
-- estimate_direct_costs (portal policy n/a here)
-- ---------------------------------------------------------------------
drop policy if exists "org members can manage estimate_direct_costs" on public.estimate_direct_costs;
create policy "org members can manage estimate_direct_costs" on public.estimate_direct_costs
  for all
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.my_role() is distinct from 'crew'
    and public.has_crm_access()
  );

-- ---------------------------------------------------------------------
-- estimate_line_items (portal policy untouched)
-- ---------------------------------------------------------------------
drop policy if exists "org members can manage estimate_line_items" on public.estimate_line_items;
create policy "org members can manage estimate_line_items" on public.estimate_line_items
  for all
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.my_role() is distinct from 'crew'
    and public.has_crm_access()
  );

-- ---------------------------------------------------------------------
-- estimates (portal policy untouched)
-- ---------------------------------------------------------------------
drop policy if exists "org members can manage estimates" on public.estimates;
create policy "org members can manage estimates" on public.estimates
  for all
  using (
    org_id = public.my_org_id()
    and public.my_role() is distinct from 'crew'
    and public.has_crm_access()
  )
  with check (
    org_id = public.my_org_id()
    and public.my_role() is distinct from 'crew'
    and public.has_crm_access()
  );
