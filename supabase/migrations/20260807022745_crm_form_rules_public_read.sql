-- crm_form_rules had no public-read policy at all, so the public form page
-- had no way to fetch rule definitions even after the save path was fixed
-- (20260806000004) — the Rules tab saved correctly but the rules were never
-- readable by an anonymous visitor, so nothing could ever evaluate them.
-- Matches crm_form_fields_public_read's shape exactly.

DROP POLICY IF EXISTS crm_form_rules_public_read ON crm_form_rules;
CREATE POLICY crm_form_rules_public_read ON crm_form_rules
  FOR SELECT USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM crm_forms f
      WHERE f.id = crm_form_rules.form_id AND f.status = 'published' AND f.deleted_at IS NULL
    )
  );
