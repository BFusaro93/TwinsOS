-- Add portal_ticket_categories to client_portal_settings
-- Stores which ticket categories are visible to portal clients (subset of org ticket_categories)
ALTER TABLE client_portal_settings
  ADD COLUMN IF NOT EXISTS portal_ticket_categories text[] NOT NULL DEFAULT '{}';

-- Portal users can create tickets for their own client
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_tickets' AND policyname = 'portal user creates own tickets') THEN
    EXECUTE $policy$
      CREATE POLICY "portal user creates own tickets"
        ON crm_tickets FOR INSERT
        WITH CHECK (
          client_id IN (SELECT client_id FROM client_portal_users WHERE user_id = auth.uid())
          AND org_id IN (SELECT org_id FROM client_portal_users WHERE user_id = auth.uid())
        )
    $policy$;
  END IF;
END $$;

-- Portal users can read their own tickets
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_tickets' AND policyname = 'portal user reads own tickets') THEN
    EXECUTE $policy$
      CREATE POLICY "portal user reads own tickets"
        ON crm_tickets FOR SELECT
        USING (
          client_id IN (SELECT client_id FROM client_portal_users WHERE user_id = auth.uid())
        )
    $policy$;
  END IF;
END $$;
