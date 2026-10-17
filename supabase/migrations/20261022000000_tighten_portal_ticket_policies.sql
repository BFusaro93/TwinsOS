-- Tighten the client-portal policies on crm_tickets.
--
-- Before: "portal user reads own tickets" allowed ANY ticket on the customer's
-- client — no visible_to_client, no deleted_at, no org check. Only the portal
-- API's own `.eq("visible_to_client", true)` hid staff/automation/form tickets
-- (internal notes, collections, soft-deleted rows), so a customer holding their
-- own JWT could read them directly through PostgREST. "portal user creates own
-- tickets" checked client_id and org_id independently (a user linked to two
-- orgs could pair one org's client with the other's org_id) and let a direct
-- insert set any column (status, priority, assigned_to_id, ...).
--
-- After: both policies require a live (non-revoked) client_portal_users link
-- matching the row's client AND org in one EXISTS. Reads are limited to live,
-- client-visible tickets. Inserts are limited to what the portal API itself
-- creates: an open, normal-priority, client-visible, unassigned ticket.

drop policy if exists "portal user reads own tickets" on public.crm_tickets;
create policy "portal user reads own tickets"
  on public.crm_tickets for select
  using (
    visible_to_client = true
    and deleted_at is null
    and exists (
      select 1
      from public.client_portal_users cpu
      where cpu.user_id = auth.uid()
        and cpu.client_id = crm_tickets.client_id
        and cpu.org_id = crm_tickets.org_id
        and cpu.deleted_at is null
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
    and exists (
      select 1
      from public.client_portal_users cpu
      where cpu.user_id = auth.uid()
        and cpu.client_id = crm_tickets.client_id
        and cpu.org_id = crm_tickets.org_id
        and cpu.deleted_at is null
    )
  );
