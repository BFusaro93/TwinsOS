-- Lets a user remove a revoked API key from their own view without losing
-- the audit trail (key_hash, scopes, revoked_at, etc. stay in the row) --
-- matches this repo's soft-delete-only convention. Only ever set on a key
-- that's already revoked; the list query filters WHERE deleted_at IS NULL.
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
