-- Lets an org opt specific non-admin roles into write access via the OAuth
-- sign-in flow (src/lib/api/oauth.ts's allowedTiersForRole). Admins always
-- get write; this only ever ADDS roles beyond that, never removes admin's.
-- Empty array (the default) matches this feature's original, hardcoded
-- behavior -- only admins can grant write.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS oauth_write_roles text[] NOT NULL DEFAULT '{}';
