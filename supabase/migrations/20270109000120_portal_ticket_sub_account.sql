-- Bug sweep round 15 (area 1): portal tickets for SUB-ACCOUNTS (regression from #530).
--
-- WHAT / WHY
--   20270107000200 tightened portal_ticket_insert_allowed(p_client_id, p_org_id) so it only
--   answers for the service role, a member of p_org_id, or the portal login's OWN client
--   (client_portal_users.client_id = p_client_id). A parent account's portal login filing a
--   ticket for one of its sub-accounts (which the "portal user creates own tickets" policy and
--   /api/portal/tickets both allow via portal_visible_clients()) now failed the RLS check and
--   the route answered 500.
--
--   The "who may ask" branch now also accepts any (client, org) pair in
--   portal_visible_clients() — the login's own client plus its live sub-accounts, in the
--   login's org only — so the cross-org oracle closed by #530 stays closed. Everything else
--   (tickets switch, 10-per-10-minutes rate limit, grants) is unchanged from the current
--   definition.
--
-- PROD: apply BEFORE or AFTER the code deploy (DB-only fix). No pre-check needed.

create or replace function public.portal_ticket_insert_allowed(p_client_id uuid, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- who may ask: the service role, a member of that org, that client's own portal login,
    -- or a parent account's portal login asking about one of its sub-accounts
    (
      auth.uid() is null
      or p_org_id is not distinct from public.my_org_id()
      or exists (
        select 1
          from public.client_portal_users u
         where u.user_id = auth.uid()
           and u.client_id = p_client_id
           and u.org_id = p_org_id
           and u.deleted_at is null
      )
      or exists (
        select 1
          from public.portal_visible_clients() v
         where v.client_id = p_client_id
           and v.org_id = p_org_id
      )
    )
    -- portal tickets switched on (a missing settings row means allowed)
    and coalesce((
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
