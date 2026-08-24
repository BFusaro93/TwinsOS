-- ─────────────────────────────────────────────────────────────────
-- Client Portal Foundation
-- Tables: client_portal_settings, client_portal_invites, client_portal_users
-- ─────────────────────────────────────────────────────────────────

-- Branding / feature toggles per org
CREATE TABLE IF NOT EXISTS client_portal_settings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL UNIQUE REFERENCES organizations(id),
  company_name   text,
  logo_url       text,
  accent_color   text NOT NULL DEFAULT '#60ab45',
  support_email  text,
  support_phone  text,
  allow_tickets  boolean NOT NULL DEFAULT true,
  allow_estimates boolean NOT NULL DEFAULT true,
  welcome_message text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_portal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members manage portal settings"
  ON client_portal_settings FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Invitation tokens sent to clients
CREATE TABLE IF NOT EXISTS client_portal_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id),
  client_id   uuid NOT NULL REFERENCES clients(id),
  email       text NOT NULL,
  token       text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  accepted_at timestamptz,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id)
);

ALTER TABLE client_portal_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members manage invites"
  ON client_portal_invites FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Public read for token validation during registration (no auth yet)
CREATE POLICY "public read invite by token"
  ON client_portal_invites FOR SELECT
  USING (accepted_at IS NULL AND expires_at > now());

-- Links an auth.user to a crm client — created at registration
CREATE TABLE IF NOT EXISTS client_portal_users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id),
  client_id  uuid NOT NULL REFERENCES clients(id),
  user_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  email      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_portal_users ENABLE ROW LEVEL SECURITY;

-- Portal users can read their own record
CREATE POLICY "portal user reads own record"
  ON client_portal_users FOR SELECT
  USING (user_id = auth.uid());

-- Org staff can read/manage portal users
CREATE POLICY "org members manage portal users"
  ON client_portal_users FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ─── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS client_portal_invites_token_idx ON client_portal_invites(token);
CREATE INDEX IF NOT EXISTS client_portal_invites_client_idx ON client_portal_invites(client_id);
CREATE INDEX IF NOT EXISTS client_portal_users_user_idx ON client_portal_users(user_id);
CREATE INDEX IF NOT EXISTS client_portal_users_client_idx ON client_portal_users(client_id);

-- ─── Portal read policies on existing CRM tables ────────────────
-- Clients can read their own client record
CREATE POLICY "portal user reads own client"
  ON clients FOR SELECT
  USING (
    id IN (
      SELECT client_id FROM client_portal_users WHERE user_id = auth.uid()
    )
  );

-- Clients can read their own invoices
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_invoices')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_invoices' AND policyname = 'portal user reads own invoices') THEN
    EXECUTE $policy$
      CREATE POLICY "portal user reads own invoices"
        ON crm_invoices FOR SELECT
        USING (
          client_id IN (
            SELECT client_id FROM client_portal_users WHERE user_id = auth.uid()
          )
        )
    $policy$;
  END IF;
END $$;

-- Clients can read their own job visits
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_job_visits')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_job_visits' AND policyname = 'portal user reads own visits') THEN
    EXECUTE $policy$
      CREATE POLICY "portal user reads own visits"
        ON crm_job_visits FOR SELECT
        USING (
          client_id IN (
            SELECT client_id FROM client_portal_users WHERE user_id = auth.uid()
          )
        )
    $policy$;
  END IF;
END $$;

-- Clients can read their own estimates
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_estimates')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_estimates' AND policyname = 'portal user reads own estimates') THEN
    EXECUTE $policy$
      CREATE POLICY "portal user reads own estimates"
        ON crm_estimates FOR SELECT
        USING (
          client_id IN (
            SELECT client_id FROM client_portal_users WHERE user_id = auth.uid()
          )
        )
    $policy$;
  END IF;
END $$;
