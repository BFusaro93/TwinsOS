-- Add Samsara integration fields to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS samsara_api_key        text,
  ADD COLUMN IF NOT EXISTS last_samsara_sync_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_samsara_sync_status text
    CHECK (last_samsara_sync_status IN ('ok', 'error', 'partial'));
