-- Add 'create_work_order' as a distinct action type (replacing the old
-- 'create_wo_request' which was misleadingly named), and keep 'create_wo_request'
-- to mean "create a maintenance_requests row" (the approval-flow path).

ALTER TABLE public.automations
  DROP CONSTRAINT IF EXISTS automations_action_type_check;

ALTER TABLE public.automations
  ADD CONSTRAINT automations_action_type_check
  CHECK (action_type IN (
    'create_work_order',
    'create_wo_request',
    'create_requisition',
    'send_notification',
    'send_email'
  ));

-- Migrate existing rows: old 'create_wo_request' was really creating WOs directly.
UPDATE public.automations
  SET action_type = 'create_work_order'
  WHERE action_type = 'create_wo_request';
