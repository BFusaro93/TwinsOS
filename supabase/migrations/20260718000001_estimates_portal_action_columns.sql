-- Client portal accept/decline flow (POST /api/portal/estimates/[id]/action) updates
-- these columns on estimates, but they were never added to the table — every accept
-- or decline from the client portal has failed with PGRST204 "column not found".

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS portal_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_signature_name text,
  ADD COLUMN IF NOT EXISTS portal_user_id uuid REFERENCES auth.users(id);
