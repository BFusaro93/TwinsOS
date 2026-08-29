-- ── oauth_clients table ─────────────────────────────────────────────────────
-- Dynamically-registered OAuth clients (RFC 7591) for the MCP server's
-- OAuth 2.1 + PKCE sign-in flow (Claude.ai's connector, or any other MCP
-- client that supports OAuth). Not org-scoped -- a client app (e.g. "Claude")
-- registers itself once and is then used across every org's sign-in flow.
-- Public clients only for now (Claude registers with no client_secret and
-- uses PKCE instead), so client_secret_hash is nullable.

CREATE TABLE public.oauth_clients (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         text        NOT NULL UNIQUE,
  client_secret_hash text,
  client_name       text        NOT NULL,
  redirect_uris     jsonb       NOT NULL DEFAULT '[]',
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
-- No end-user policy: only the service-role client (src/lib/api/auth.ts-style
-- admin client) reads/writes this table, from the registration/authorize/
-- token route handlers.

-- ── oauth_authorization_codes table ─────────────────────────────────────────
-- Short-lived (~10 min), single-use authorization codes issued at the end of
-- the consent step, exchanged for tokens by /api/mcp/oauth/token. Scopes
-- here are whatever the user picked on the consent screen (see the
-- oauth_tokens.scopes comment below for how they're enforced downstream).

CREATE TABLE public.oauth_authorization_codes (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash             text        NOT NULL UNIQUE,
  client_id             text        NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id               uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id                uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scopes                text[]      NOT NULL DEFAULT '{}',
  code_challenge        text        NOT NULL,
  code_challenge_method text        NOT NULL DEFAULT 'S256',
  redirect_uri          text        NOT NULL,
  expires_at            timestamptz NOT NULL,
  used_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_authorization_codes ENABLE ROW LEVEL SECURITY;
-- No end-user policy: service-role only, same reasoning as oauth_clients.

-- ── oauth_tokens table ───────────────────────────────────────────────────────
-- Access + refresh tokens issued from a completed OAuth flow. Same
-- resource:tier scope strings as api_keys.scopes (src/lib/api/scopes.ts) --
-- src/lib/api/auth.ts's lookupApiKey() checks api_keys.key_hash first, then
-- falls back to oauth_tokens.token_hash, unifying both into the same
-- { orgId, scopes } shape so every downstream scope check is unchanged.
-- token_type distinguishes an access token (short-lived, used directly as
-- the MCP bearer token) from a refresh token (longer-lived, only ever
-- exchanged at /api/mcp/oauth/token, never sent as a bearer token itself).

CREATE TABLE public.oauth_tokens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    text        NOT NULL UNIQUE,
  token_type    text        NOT NULL CHECK (token_type IN ('access', 'refresh')),
  client_id     text        NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id        uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scopes        text[]      NOT NULL DEFAULT '{}',
  -- Refresh tokens rotate: exchanging one issues a new access+refresh pair
  -- and revokes the old refresh token, linked here for audit/cleanup.
  replaced_by   uuid        REFERENCES public.oauth_tokens(id),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Org members can see (and revoke, via the app's own route handler checking
-- admin role -- same as api_keys) which OAuth connections exist for their
-- org, for a future "connected apps" settings UI (see oauth_clients join for
-- the app name). Only ever written by the service-role client from the
-- oauth route handlers, so no INSERT/UPDATE policy is needed for end users.
CREATE POLICY "org_members_read_oauth_tokens" ON public.oauth_tokens
  FOR SELECT
  USING (org_id = public.my_org_id());
