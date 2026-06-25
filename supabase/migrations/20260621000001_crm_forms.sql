-- CRM Forms: form builder, responses, public submissions

-- Forms
CREATE TABLE IF NOT EXISTS crm_forms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id),
  name        text NOT NULL,
  slug        text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  settings    jsonb NOT NULL DEFAULT '{}',
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES profiles(id),
  UNIQUE (org_id, slug)
);

-- Form fields
CREATE TABLE IF NOT EXISTS crm_form_fields (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id      uuid NOT NULL REFERENCES crm_forms(id) ON DELETE CASCADE,
  org_id       uuid NOT NULL REFERENCES organizations(id),
  field_type   text NOT NULL CHECK (field_type IN ('text', 'email', 'phone', 'textarea', 'select', 'checkbox', 'date')),
  label        text NOT NULL,
  placeholder  text,
  required     boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  options      jsonb,  -- for select: ["Option A", "Option B"]
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Form responses
CREATE TABLE IF NOT EXISTS crm_form_responses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           uuid NOT NULL REFERENCES crm_forms(id) ON DELETE CASCADE,
  org_id            uuid NOT NULL REFERENCES organizations(id),
  submitted_by_name text,
  submitted_by_email text,
  data              jsonb NOT NULL DEFAULT '{}',
  result            text,  -- 'Account Created', 'Account Updated', 'Ticket Created', 'Lead Created'
  status            text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'completed', 'spam')),
  related_client_id uuid REFERENCES clients(id),
  related_ticket_id uuid REFERENCES crm_tickets(id),
  form_location     text,  -- 'Website', 'Email', 'Manual', etc.
  is_read           boolean NOT NULL DEFAULT false,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS crm_forms_org_id_idx ON crm_forms(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_forms_slug_idx ON crm_forms(slug, org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_form_fields_form_id_idx ON crm_form_fields(form_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_form_responses_form_id_idx ON crm_form_responses(form_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_form_responses_org_id_idx ON crm_form_responses(org_id) WHERE deleted_at IS NULL;

-- Triggers
CREATE TRIGGER crm_forms_updated_at
  BEFORE UPDATE ON crm_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER crm_form_fields_updated_at
  BEFORE UPDATE ON crm_form_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER crm_form_responses_updated_at
  BEFORE UPDATE ON crm_form_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE crm_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_form_responses ENABLE ROW LEVEL SECURITY;

-- crm_forms: org-scoped
CREATE POLICY crm_forms_org ON crm_forms
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- crm_form_fields: org-scoped
CREATE POLICY crm_form_fields_org ON crm_form_fields
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- crm_form_responses: org-scoped
CREATE POLICY crm_form_responses_org ON crm_form_responses
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Public read for published forms (for the public form renderer)
CREATE POLICY crm_forms_public_read ON crm_forms
  FOR SELECT USING (status = 'published' AND deleted_at IS NULL);

CREATE POLICY crm_form_fields_public_read ON crm_form_fields
  FOR SELECT USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM crm_forms f
      WHERE f.id = crm_form_fields.form_id AND f.status = 'published' AND f.deleted_at IS NULL
    )
  );

-- Public insert for form responses (anonymous submission)
CREATE POLICY crm_form_responses_public_insert ON crm_form_responses
  FOR INSERT WITH CHECK (true);
