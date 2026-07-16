-- Extend the PO approval-flow infrastructure to cover CRM estimates, and add
-- the columns needed to gate estimate sends behind approval + track send time
-- for time-gap automation triggers.

ALTER TABLE public.approval_flows
  DROP CONSTRAINT approval_flows_entity_type_check;
ALTER TABLE public.approval_flows
  ADD CONSTRAINT approval_flows_entity_type_check
    CHECK (entity_type IN ('requisition', 'purchase_order', 'crm_estimate'));

ALTER TABLE public.approval_requests
  DROP CONSTRAINT approval_requests_entity_type_check;
ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_requests_entity_type_check
    CHECK (entity_type IN ('requisition', 'purchase_order', 'crm_estimate'));

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected'));

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;
