-- ── integrations table ──────────────────────────────────────────────────────
-- Generic per-org integration registry. Each row is one connected service
-- (e.g. 'samsara', 'quickbooks', 'geotab'). Adding a new integration never
-- requires a schema change — just a new row.

CREATE TABLE public.integrations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider         text        NOT NULL,
  api_key          text,
  config           jsonb       NOT NULL DEFAULT '{}',
  enabled          boolean     NOT NULL DEFAULT true,
  last_sync_at     timestamptz,
  last_sync_status text        CHECK (last_sync_status IN ('ok', 'error', 'partial')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider)
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_integrations" ON public.integrations
  FOR ALL
  USING  (org_id = public.my_org_id())
  WITH CHECK (org_id = public.my_org_id());

-- Migrate any existing Samsara keys from the old organizations columns.
INSERT INTO public.integrations (org_id, provider, api_key, last_sync_at, last_sync_status)
SELECT
  id,
  'samsara',
  samsara_api_key,
  last_samsara_sync_at,
  last_samsara_sync_status
FROM public.organizations
WHERE samsara_api_key IS NOT NULL AND samsara_api_key <> ''
ON CONFLICT (org_id, provider) DO NOTHING;

-- Drop the now-redundant columns from organizations.
ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS samsara_api_key,
  DROP COLUMN IF EXISTS last_samsara_sync_at,
  DROP COLUMN IF EXISTS last_samsara_sync_status;
