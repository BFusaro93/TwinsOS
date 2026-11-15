-- Why the last sync failed, so staff can see the reason on /internal/health
-- instead of just an "error" status. Cleared (NULL) on a successful sync.
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS last_sync_error text;
