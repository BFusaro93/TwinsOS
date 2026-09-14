-- crm_form_rules was created (20260624000001_crm_forms_sprint_a.sql) without
-- deleted_at/created_by, but the API route (src/app/api/crm/forms/[id]/rules/route.ts)
-- has always read/written both columns — GET always 500s ("column
-- crm_form_rules.deleted_at does not exist"), and PUT always 500s on its
-- unconditional soft-delete step, even when there are zero rules to save.
-- Since Form Builder's handleSave calls saveFields then saveRules in one
-- try/catch, this made every single "Save Changes" click report failure —
-- even when only Fields were edited and actually saved fine.

ALTER TABLE public.crm_form_rules ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.crm_form_rules ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS crm_form_rules_form_id_idx ON public.crm_form_rules(form_id) WHERE deleted_at IS NULL;
