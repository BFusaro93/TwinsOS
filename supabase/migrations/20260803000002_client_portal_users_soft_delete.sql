-- portal-reset hard-deleted client_portal_users rows, violating this
-- project's soft-delete convention (CLAUDE.md: "Never hard delete records")
-- and destroying any record that a client ever had portal access. Add the
-- standard deleted_at column so resets can be soft.

ALTER TABLE public.client_portal_users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
