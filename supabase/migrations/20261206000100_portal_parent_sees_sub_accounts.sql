-- A parent client's portal login sees (and pays) its sub-accounts.
--
-- Clients can have one level of sub-accounts (clients.parent_client_id — a
-- commercial property manager and its properties). The office already treats
-- the children as payable by the parent (record_stripe_invoice_payment accepts
-- a child's invoice under the parent's client id), but every portal read
-- policy matched only the login's own client_portal_users.client_id, so a
-- property manager's portal never showed sub-account invoices, visits or
-- tickets.
--
-- portal_visible_clients() is the one place that answers "which (client, org)
-- pairs may this portal session see": each live client_portal_users link of
-- auth.uid(), plus that client's live direct children in the same org. The
-- app resolves the same set in getPortalAccounts() (src/lib/portal/
-- get-portal-context.ts) for service-client reads and ownership checks.
--
-- The four portal policies that check client_portal_users inline
-- (20260825000000_client_portal_multi_org.sql for invoices/visits,
-- 20261022000000_tighten_portal_ticket_policies.sql for tickets) are
-- re-created on top of it, keeping every other condition as it was. The
-- subquery is uncorrelated, so it runs once per statement instead of once per
-- row — staff reads of these tables (which OR this permissive policy with
-- their own) get cheaper, not dearer.
--
-- Deliberately unchanged:
--   * "portal user reads own client" on clients — a parent login reads its
--     sub-accounts' names/balances through the service client, scoped by
--     getPortalAccounts(); it doesn't need RLS read on the child rows.
--   * portal_documents (20261022000300) — documents are org-wide, not
--     per-client, so a parent link changes nothing there.
--   * Saved card / autopay — they stay on the clients row of the login that
--     saved them; nothing here grants writes on a child.

create or replace function public.portal_visible_clients()
returns table (client_id uuid, org_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select cpu.client_id, cpu.org_id
  from public.client_portal_users cpu
  where cpu.user_id = auth.uid()
    and cpu.deleted_at is null
  union
  select c.id, c.org_id
  from public.client_portal_users cpu
  join public.clients c
    on c.parent_client_id = cpu.client_id
   and c.org_id = cpu.org_id
  where cpu.user_id = auth.uid()
    and cpu.deleted_at is null
    and c.deleted_at is null
$$;

comment on function public.portal_visible_clients() is
  'Client ids (with org) the current portal session may see: its own client_portal_users links plus those clients'' live direct sub-accounts.';

-- An RLS helper: the policies below apply to every role, so anon must be able
-- to execute it (otherwise an anon read of these tables errors instead of
-- returning nothing). It only ever returns auth.uid()'s own links — empty for
-- anon.
revoke all on function public.portal_visible_clients() from public;
grant execute on function public.portal_visible_clients() to anon, authenticated, service_role;

drop policy if exists "portal user reads own invoices" on public.crm_invoices;
create policy "portal user reads own invoices"
  on public.crm_invoices for select
  using (
    (crm_invoices.client_id, crm_invoices.org_id) in (
      select v.client_id, v.org_id from public.portal_visible_clients() v
    )
  );

drop policy if exists "portal user reads own visits" on public.crm_job_visits;
create policy "portal user reads own visits"
  on public.crm_job_visits for select
  using (
    (crm_job_visits.client_id, crm_job_visits.org_id) in (
      select v.client_id, v.org_id from public.portal_visible_clients() v
    )
  );

drop policy if exists "portal user reads own tickets" on public.crm_tickets;
create policy "portal user reads own tickets"
  on public.crm_tickets for select
  using (
    visible_to_client = true
    and deleted_at is null
    and (crm_tickets.client_id, crm_tickets.org_id) in (
      select v.client_id, v.org_id from public.portal_visible_clients() v
    )
  );

drop policy if exists "portal user creates own tickets" on public.crm_tickets;
create policy "portal user creates own tickets"
  on public.crm_tickets for insert
  with check (
    visible_to_client = true
    and deleted_at is null
    and status = 'open'
    and priority = 'normal'
    and assigned_to_id is null
    and (crm_tickets.client_id, crm_tickets.org_id) in (
      select v.client_id, v.org_id from public.portal_visible_clients() v
    )
  );
