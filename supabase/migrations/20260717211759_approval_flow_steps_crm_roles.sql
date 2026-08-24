-- Estimate approval steps (entity_type = 'crm_estimate') need to reference CRM-specific
-- roles from the org-defined `crm_roles` table, not the fixed CMMS Role enum. The old
-- CHECK constraint only allowed admin/manager/technician/purchaser/viewer/requestor,
-- which made it impossible to gate estimate approval by a CRM role (Operations Manager,
-- Sales/Account Manager, etc). crm_roles is a dynamic, org-managed table, so it can't be
-- enumerated in a CHECK constraint — validation for requisition/purchase_order steps stays
-- at the app layer (already enforced by the fixed ROLE_OPTIONS list in the settings UI).
alter table public.approval_flow_steps
  drop constraint if exists approval_flow_steps_required_role_check;
