-- Add e-signature fields to crm_estimates for portal approval flow
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_estimates') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_estimates' AND column_name = 'portal_accepted_at') THEN
      ALTER TABLE crm_estimates ADD COLUMN portal_accepted_at timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_estimates' AND column_name = 'portal_declined_at') THEN
      ALTER TABLE crm_estimates ADD COLUMN portal_declined_at timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_estimates' AND column_name = 'portal_signature_name') THEN
      ALTER TABLE crm_estimates ADD COLUMN portal_signature_name text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_estimates' AND column_name = 'portal_user_id') THEN
      ALTER TABLE crm_estimates ADD COLUMN portal_user_id uuid REFERENCES auth.users(id);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_estimates') THEN
    CREATE INDEX IF NOT EXISTS crm_estimates_portal_user_id_idx ON crm_estimates(portal_user_id);
  END IF;
END $$;
