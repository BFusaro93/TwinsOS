-- Sprint A: Multi-page forms, field mapping, conditional rules, response status fix

-- ─── 1. crm_form_fields — new columns ────────────────────────────────────────

ALTER TABLE crm_form_fields
  ADD COLUMN IF NOT EXISTS page_number   integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mapped_field  text,    -- e.g. 'client.first_name', 'client.email'
  ADD COLUMN IF NOT EXISTS description   text,    -- helper text shown below the field label
  ADD COLUMN IF NOT EXISTS config        jsonb NOT NULL DEFAULT '{}'; -- type-specific config (rating scale, star count, etc.)

-- Expand field_type CHECK constraint to include all SA V3 field types
ALTER TABLE crm_form_fields DROP CONSTRAINT IF EXISTS crm_form_fields_field_type_check;
ALTER TABLE crm_form_fields ADD CONSTRAINT crm_form_fields_field_type_check
  CHECK (field_type IN (
    -- simple fields
    'text', 'email', 'phone', 'textarea', 'select', 'checkbox', 'date', 'number',
    -- advanced fields
    'multiple_choice', 'checklist', 'rating', 'review', 'hidden', 'sms_optin',
    -- layout / display elements
    'header', 'paragraph', 'divider',
    -- widgets
    'attachment'
  ));

-- Index for multi-page field lookups
CREATE INDEX IF NOT EXISTS crm_form_fields_page_idx
  ON crm_form_fields(form_id, page_number) WHERE deleted_at IS NULL;

-- ─── 2. crm_form_responses — fix status values ───────────────────────────────

-- Migrate existing 'new' rows to 'on_hold' before changing the constraint
UPDATE crm_form_responses SET status = 'on_hold' WHERE status = 'new';

ALTER TABLE crm_form_responses DROP CONSTRAINT IF EXISTS crm_form_responses_status_check;
ALTER TABLE crm_form_responses ADD CONSTRAINT crm_form_responses_status_check
  CHECK (status IN ('on_hold', 'completed', 'spam', 'ignored'));

ALTER TABLE crm_form_responses ALTER COLUMN status SET DEFAULT 'on_hold';

-- ─── 3. crm_forms — account management columns ───────────────────────────────

ALTER TABLE crm_forms
  ADD COLUMN IF NOT EXISTS auto_manage_accounts      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_matching_strategy text    NOT NULL DEFAULT 'email'
    CHECK (account_matching_strategy IN ('email', 'name_and_email', 'name_email_and_company', 'custom')),
  ADD COLUMN IF NOT EXISTS account_update_strategy   text    NOT NULL DEFAULT 'add_new'
    CHECK (account_update_strategy IN ('replace_all', 'add_new'));

-- ─── 4. crm_form_rules — conditional logic ───────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_form_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id          uuid NOT NULL REFERENCES crm_forms(id) ON DELETE CASCADE,
  org_id           uuid NOT NULL REFERENCES organizations(id),
  -- which field triggers this rule (null = fires on page navigation)
  source_field_id  uuid REFERENCES crm_form_fields(id) ON DELETE CASCADE,
  -- 'page' rules fire when the user clicks Next/Previous; 'field' rules fire on field value change
  rule_type        text NOT NULL DEFAULT 'page'
    CHECK (rule_type IN ('page', 'field')),
  -- comparison operator
  operator         text NOT NULL
    CHECK (operator IN ('equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'is_empty', 'is_not_empty')),
  operand          text,   -- value to compare against (null for is_empty / is_not_empty)
  -- what to do when the condition is met
  action           text NOT NULL
    CHECK (action IN ('jump_to_page', 'show_field', 'hide_field', 'add_tag', 'remove_tag')),
  action_value     text,   -- page number, field id, or tag id depending on action
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_form_rules_form_id_idx
  ON crm_form_rules(form_id);

CREATE INDEX IF NOT EXISTS crm_form_rules_source_field_id_idx
  ON crm_form_rules(source_field_id);

CREATE TRIGGER crm_form_rules_updated_at
  BEFORE UPDATE ON crm_form_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE crm_form_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_form_rules_org ON crm_form_rules
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
