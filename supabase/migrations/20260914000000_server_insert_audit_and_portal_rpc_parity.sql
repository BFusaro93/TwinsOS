-- Three functions the application calls existed on the test database and NOT
-- on production. Found by checking every `supabase.rpc("…")` in src/ against
-- pg_proc on both projects.
--
--   * get_portal_invite_by_token  — /api/portal/invites/[token], /api/portal/register
--   * get_auth_user_id_by_email   — /api/portal/register
--   * server_insert_audit         — /api/crm/invoices/merge
--
-- The first two had migration files (20260824131000, 20260825000010) that were
-- simply never applied to production, so on prod the whole client-portal invite
-- and registration flow returned "Invalid or expired invite" for every valid
-- invite — the RPC 404s, and the route cannot tell that apart from a bad token.
--
-- Worse, 20260824131000 is also a SECURITY fix, and prod never got that either.
-- It drops this policy, which was still live on production:
--
--   CREATE POLICY "public read invite by token" ON client_portal_invites
--     FOR SELECT USING (accepted_at IS NULL AND expires_at > now());
--
-- Granted to `public`, and it never scopes by token or by org — so anyone
-- holding the publishable anon key could read EVERY organisation's pending
-- portal invites straight from PostgREST: the client's email address together
-- with the invite token, which is the credential for completing registration.
-- The routes' own `.eq("token", token)` is an application habit, not something
-- RLS enforced. (Nothing was exposed at the time of this fix — there were zero
-- pending invites — but the hole was open for any invite sent after 8/24.)
--
-- Those two are applied to prod directly, under their own names, so the ledger
-- records them. This file exists for the third: server_insert_audit has no
-- migration anywhere. It was created ad-hoc on the test project and never
-- committed, which is the recurring "table/function created straight on one
-- environment" pattern — so prod silently dropped the audit entry for every
-- invoice merge. The route awaits the RPC without checking its error, so the
-- merge succeeded and only the audit trail was lost.
--
-- Reconstructed from the live definition on test, with one change: test grants
-- EXECUTE to `authenticated` and the body trusts p_org_id from the caller, so
-- any signed-in user could write an audit row against any organisation under
-- any name. The guard below keeps the one legitimate caller working (a
-- user-scoped server route writing for its own org) and closes the forgery.
create or replace function public.server_insert_audit(
  p_org_id      uuid,
  p_record_type text,
  p_record_id   uuid,
  p_action      text,
  p_description text,
  p_created_by  uuid default null,
  p_user_name   text default 'System'
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- A signed-in caller may only write audit rows for their OWN org. The
  -- service role (auth.uid() is null) is trusted — it is already unrestricted.
  if auth.uid() is not null and p_org_id is distinct from public.my_org_id() then
    raise exception 'Cannot write an audit entry for another organization'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description
  ) values (
    p_org_id, p_created_by, p_record_type, p_record_id, p_action,
    p_user_name, p_description
  );
end;
$$;

revoke execute on function public.server_insert_audit(uuid, text, uuid, text, text, uuid, text) from public, anon;
grant execute on function public.server_insert_audit(uuid, text, uuid, text, text, uuid, text) to authenticated, service_role;
