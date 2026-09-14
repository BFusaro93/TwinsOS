-- ── api_keys table ──────────────────────────────────────────────────────────
-- Public API key registry for the full Equipt/Landscapt REST API (separate
-- from the Zapier-specific key on `integrations` — Zapier keeps its own
-- single all-or-nothing key for now). Each org can issue multiple keys, each
-- scoped to a set of `resource:tier` scopes (e.g. "clients:read",
-- "requisitions:write:safe", "purchase_orders:write:sensitive") so a key can
-- be limited to exactly what its caller needs. The plaintext key is shown to
-- the org once at creation time and never stored — only its sha256 hash.

CREATE TABLE public.api_keys (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name               text        NOT NULL,
  key_prefix         text        NOT NULL,
  key_hash           text        NOT NULL UNIQUE,
  scopes             text[]      NOT NULL DEFAULT '{}',
  rate_limit_per_min integer     NOT NULL DEFAULT 60,
  created_by         uuid        REFERENCES public.profiles(id),
  last_used_at       timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_api_keys" ON public.api_keys
  FOR ALL
  USING  (org_id = public.my_org_id())
  WITH CHECK (org_id = public.my_org_id());

-- ── api_key_rate_limits table ───────────────────────────────────────────────
-- One row per (api_key, calendar minute), incremented on every authenticated
-- request via increment_api_key_rate_limit() below. Only ever written by the
-- service-role client (see src/lib/api/auth.ts), which bypasses RLS, so no
-- write policy is defined here.

CREATE TABLE public.api_key_rate_limits (
  api_key_id     uuid        NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  window_start   timestamptz NOT NULL,
  request_count  integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, window_start)
);

ALTER TABLE public.api_key_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_api_key_rate_limits" ON public.api_key_rate_limits
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.api_keys k
      WHERE k.id = api_key_rate_limits.api_key_id
        AND k.org_id = public.my_org_id()
    )
  );

CREATE OR REPLACE FUNCTION public.increment_api_key_rate_limit(
  p_api_key_id uuid,
  p_window_start timestamptz
)
RETURNS integer
LANGUAGE sql
AS $$
  INSERT INTO public.api_key_rate_limits (api_key_id, window_start, request_count)
  VALUES (p_api_key_id, p_window_start, 1)
  ON CONFLICT (api_key_id, window_start)
  DO UPDATE SET request_count = api_key_rate_limits.request_count + 1
  RETURNING request_count;
$$;
