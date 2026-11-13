-- invoice_share_tokens access (round 13, security).
--
-- One permissive ALL policy (org_id = my_org_id()) let any CRM login — crew
-- included — read every invoice pay link (drafts too), mint new ones, revoke
-- them and hard-delete them. Now the estimate_share_tokens pattern:
--   SELECT : non-crew, non-portal users with invoice access
--            (acct_view_invoice_list / acct_add_modify_invoices / acct_send_invoices)
--   INSERT / UPDATE : acct_send_invoices or acct_add_modify_invoices
--   DELETE : no policy — a link is only ever revoked (revoked_at), never deleted
-- Admins pass every permission check (has_settings_permission). The restrictive
-- require_crm_access / read_only_when_canceled_* policies stay. The service
-- role (public pay page, portal, read-only-org email bookkeeping) bypasses RLS.
--
-- PROD: apply BEFORE or AFTER the deploy — the code change (no link minted for
-- draft previews; public page refuses drafts) does not depend on it, and the
-- senders (email route needs acct_send_invoices) still pass the new checks.

drop policy if exists "org members manage invoice share tokens" on public.invoice_share_tokens;

drop policy if exists invoice_share_tokens_select on public.invoice_share_tokens;
create policy invoice_share_tokens_select on public.invoice_share_tokens
  for select to authenticated
  using (
    org_id = (select public.my_org_id())
    and (select public.my_role()) is distinct from 'crew'
    and not (select public.is_client_portal_user())
    and (select public._crm_has_any_permission(array['acct_view_invoice_list', 'acct_add_modify_invoices', 'acct_send_invoices']))
  );

drop policy if exists invoice_share_tokens_insert on public.invoice_share_tokens;
create policy invoice_share_tokens_insert on public.invoice_share_tokens
  for insert to authenticated
  with check (
    org_id = (select public.my_org_id())
    and (select public.my_role()) is distinct from 'crew'
    and not (select public.is_client_portal_user())
    and (select public._crm_has_any_permission(array['acct_send_invoices', 'acct_add_modify_invoices']))
  );

drop policy if exists invoice_share_tokens_update on public.invoice_share_tokens;
create policy invoice_share_tokens_update on public.invoice_share_tokens
  for update to authenticated
  using (
    org_id = (select public.my_org_id())
    and (select public.my_role()) is distinct from 'crew'
    and not (select public.is_client_portal_user())
    and (select public._crm_has_any_permission(array['acct_send_invoices', 'acct_add_modify_invoices']))
  )
  with check (
    org_id = (select public.my_org_id())
    and (select public.my_role()) is distinct from 'crew'
    and not (select public.is_client_portal_user())
    and (select public._crm_has_any_permission(array['acct_send_invoices', 'acct_add_modify_invoices']))
  );
