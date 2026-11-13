-- Portal ticket INSERT policy limits (round 13, security).
--
-- The "portal user creates own tickets" policy let a portal login insert
-- tickets straight through the REST API, skipping every limit the
-- /api/portal/tickets route applies (10 per 10 minutes, 200-char subject,
-- 5,000-char body, portal tickets switched on) and setting columns the route
-- never sets (created_by, upsell links, due date, closed_at...).
--
-- The policy is NOT dropped: the route deliberately inserts as the portal
-- user (not the service role) so fn_audit_log attributes "Ticket created" to
-- the client; dropping it would break ticket creation from the portal. It is
-- tightened to exactly the row shape the route writes, plus the route's
-- switch-on and rate checks via a SECURITY DEFINER helper.
--
-- PROD: apply BEFORE or AFTER the deploy (the route already writes this shape).

create or replace function public.portal_ticket_insert_allowed(p_client_id uuid, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- portal tickets switched on (a missing settings row means allowed)
    coalesce((
      select s.allow_tickets
      from public.client_portal_settings s
      where s.org_id = p_org_id
      limit 1
    ), true) is not false
    -- the route's rate limit: at most 10 in 10 minutes per account
    and (
      select count(*)
      from public.crm_tickets t
      where t.client_id = p_client_id
        and t.org_id = p_org_id
        and t.visible_to_client
        and t.created_at > now() - interval '10 minutes'
    ) < 10;
$$;

revoke all on function public.portal_ticket_insert_allowed(uuid, uuid) from public, anon;
grant execute on function public.portal_ticket_insert_allowed(uuid, uuid) to authenticated, service_role;

drop policy if exists "portal user creates own tickets" on public.crm_tickets;
create policy "portal user creates own tickets" on public.crm_tickets
  for insert
  with check (
    visible_to_client = true
    and deleted_at is null
    and status = 'open'
    and priority = 'normal'
    and type = 'note'
    and assigned_to_id is null
    and assigned_to is null
    and created_by is null
    and due_date is null
    and closed_at is null
    and upsell_service_id is null
    and upsell_visit_id is null
    and sms_consent_pending_phone is not true
    and char_length(btrim(coalesce(subject, ''))) between 1 and 200
    and (body is null or char_length(body) <= 5000)
    and category is not null
    and char_length(category) <= 100
    and (client_id, org_id) in (
      select v.client_id, v.org_id from public.portal_visible_clients() v(client_id, org_id)
    )
    and public.portal_ticket_insert_allowed(client_id, org_id)
  );
