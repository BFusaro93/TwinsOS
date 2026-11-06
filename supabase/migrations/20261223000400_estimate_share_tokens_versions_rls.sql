-- estimate_share_tokens / estimate_versions were FOR ALL on org_id alone
-- (plus the require_crm_access RESTRICTIVE policy, which crew logins pass).
-- A crew login could read every live proposal token and price snapshot,
-- extend or clear a token's expiry / acceptance, and insert forged versions
-- (which then become what the client's proposal link shows).
--
-- New rules (end-user sessions only — the public proposal / portal accept
-- routes, Stripe deposit paths and SECURITY DEFINER RPCs such as
-- record_proposal_view run as the service role / owner and bypass RLS):
--   * no access for crew logins or client-portal users
--   * read: any other org member with CRM access (estimate detail, convert
--     to job reads the accepted date)
--   * estimate_share_tokens insert: estimate_send (Send / Share link)
--   * estimate_share_tokens update: estimate_send (extend expiry, retire a
--     token minted for a failed send) or estimate_edit (changing the
--     estimate's client revokes its links)
--   * estimate_versions insert: estimate_send (Send / Share link publish)
--   * no UPDATE/DELETE on estimate_versions and no DELETE on tokens (soft
--     deletes only; the app never rewrites a version)
-- Admins always pass has_settings_permission. The RESTRICTIVE
-- require_crm_access / read_only_when_canceled_* policies stay as they are.

drop policy if exists "org members manage share tokens" on public.estimate_share_tokens;
drop policy if exists "estimate_share_tokens_select" on public.estimate_share_tokens;
drop policy if exists "estimate_share_tokens_insert" on public.estimate_share_tokens;
drop policy if exists "estimate_share_tokens_update" on public.estimate_share_tokens;

create policy "estimate_share_tokens_select" on public.estimate_share_tokens
  for select to authenticated
  using (
    org_id = (select public.my_org_id())
    and (select public.my_role()) is distinct from 'crew'
    and not (select public.is_client_portal_user())
  );

create policy "estimate_share_tokens_insert" on public.estimate_share_tokens
  for insert to authenticated
  with check (
    org_id = (select public.my_org_id())
    and (select public.my_role()) is distinct from 'crew'
    and not (select public.is_client_portal_user())
    and (select public.has_settings_permission('estimate_send'))
  );

create policy "estimate_share_tokens_update" on public.estimate_share_tokens
  for update to authenticated
  using (
    org_id = (select public.my_org_id())
    and (select public.my_role()) is distinct from 'crew'
    and not (select public.is_client_portal_user())
    and (select public._crm_has_any_permission(array['estimate_send', 'estimate_edit']))
  )
  with check (
    org_id = (select public.my_org_id())
    and (select public.my_role()) is distinct from 'crew'
    and not (select public.is_client_portal_user())
    and (select public._crm_has_any_permission(array['estimate_send', 'estimate_edit']))
  );

drop policy if exists "org members read estimate versions" on public.estimate_versions;
drop policy if exists "estimate_versions_select" on public.estimate_versions;
drop policy if exists "estimate_versions_insert" on public.estimate_versions;

create policy "estimate_versions_select" on public.estimate_versions
  for select to authenticated
  using (
    org_id = (select public.my_org_id())
    and (select public.my_role()) is distinct from 'crew'
    and not (select public.is_client_portal_user())
  );

create policy "estimate_versions_insert" on public.estimate_versions
  for insert to authenticated
  with check (
    org_id = (select public.my_org_id())
    and (select public.my_role()) is distinct from 'crew'
    and not (select public.is_client_portal_user())
    and (select public.has_settings_permission('estimate_send'))
  );

-- Belt and braces: versions are an append-only record for end users.
revoke update, delete on public.estimate_versions from authenticated, anon;
revoke delete on public.estimate_share_tokens from anon;
