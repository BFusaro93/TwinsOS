-- CRM Automations migration

CREATE TABLE crm_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT my_org_id() REFERENCES organizations(id),
  name text NOT NULL,
  description text,
  is_active bool NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE crm_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org isolation" ON crm_automations USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm_automations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE crm_automation_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT my_org_id() REFERENCES organizations(id),
  automation_id uuid NOT NULL REFERENCES crm_automations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  restrict_entry_to text NOT NULL DEFAULT 'all',
  allow_reentry bool NOT NULL DEFAULT false,
  reentry_after_minutes int NOT NULL DEFAULT 1440,
  position int NOT NULL DEFAULT 0,
  is_active bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE crm_automation_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org isolation" ON crm_automation_sequences USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm_automation_sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE crm_sequence_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT my_org_id() REFERENCES organizations(id),
  sequence_id uuid NOT NULL REFERENCES crm_automation_sequences(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_sequence_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org isolation" ON crm_sequence_triggers USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm_sequence_triggers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE crm_sequence_trigger_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT my_org_id() REFERENCES organizations(id),
  trigger_id uuid NOT NULL REFERENCES crm_sequence_triggers(id) ON DELETE CASCADE,
  condition_group int NOT NULL DEFAULT 0,
  field text NOT NULL,
  operator text NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_sequence_trigger_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org isolation" ON crm_sequence_trigger_conditions USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm_sequence_trigger_conditions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE crm_sequence_stop_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT my_org_id() REFERENCES organizations(id),
  sequence_id uuid NOT NULL REFERENCES crm_automation_sequences(id) ON DELETE CASCADE,
  field text NOT NULL,
  operator text NOT NULL,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_sequence_stop_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org isolation" ON crm_sequence_stop_conditions USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm_sequence_stop_conditions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE crm_sequence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT my_org_id() REFERENCES organizations(id),
  sequence_id uuid NOT NULL REFERENCES crm_automation_sequences(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('wait','email','alert','text_message','ticket','if_branch','note','update','tags')),
  position int NOT NULL DEFAULT 0,
  is_active bool NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE crm_sequence_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org isolation" ON crm_sequence_events USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm_sequence_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE crm_sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT my_org_id() REFERENCES organizations(id),
  sequence_id uuid NOT NULL REFERENCES crm_automation_sequences(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  current_event_position int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','stopped','paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org isolation" ON crm_sequence_enrollments USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm_sequence_enrollments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
