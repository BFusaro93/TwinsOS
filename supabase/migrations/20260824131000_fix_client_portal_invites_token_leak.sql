-- The "public read invite by token" policy added in 20260703030521_client_portal.sql
-- was meant to let an unauthenticated registration page look up ONE invite by
-- its token, but the policy itself never scopes by token (or org_id) — it
-- grants SELECT on every pending, unexpired invite row across every
-- organization:
--
--   CREATE POLICY "public read invite by token" ON client_portal_invites
--     FOR SELECT USING (accepted_at IS NULL AND expires_at > now());
--
-- The application's own routes always add `.eq("token", token)`, but that's
-- an application-level habit, not something RLS enforces — anyone with the
-- public anon key can query PostgREST directly
-- (`/rest/v1/client_portal_invites?select=*`) with no token at all and
-- enumerate every org's pending client emails and their invite tokens, which
-- double as the credential used to complete portal registration.
--
-- Replace the blanket policy with a SECURITY DEFINER function that takes the
-- token as an argument and returns at most the one matching invite — the
-- token itself becomes the access control, not a client-side filter that RLS
-- never enforced. Deliberately does NOT filter accepted_at/expires_at here
-- (unlike the old policy) so callers can still distinguish "no such invite"
-- from "already accepted" / "expired" the way they did before.
DROP POLICY IF EXISTS "public read invite by token" ON client_portal_invites;

CREATE FUNCTION public.get_portal_invite_by_token(p_token text)
RETURNS TABLE (
  id uuid,
  email text,
  client_id uuid,
  org_id uuid,
  accepted_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, email, client_id, org_id, accepted_at, expires_at
  FROM client_portal_invites
  WHERE token = p_token;
$$;

REVOKE ALL ON FUNCTION public.get_portal_invite_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_portal_invite_by_token(text) TO anon, authenticated;
