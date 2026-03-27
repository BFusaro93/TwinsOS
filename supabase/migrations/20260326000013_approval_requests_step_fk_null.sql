-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: approval_requests_step_fk_null
--
-- useUpdateApprovalFlow saves an approval flow by deleting all existing
-- approval_flow_steps for the flow and re-inserting the new set.
--
-- The existing FK on approval_requests.flow_step_id uses the default PostgreSQL
-- behaviour (RESTRICT / NO ACTION), which blocks the DELETE when any
-- approval_request still references those steps — causing the flow save to
-- fail silently with a foreign-key violation.
--
-- Changing to ON DELETE SET NULL lets the delete succeed; any approval_request
-- rows whose step was removed will have flow_step_id set to NULL.  The approval
-- chain still works because the rows retain their status, order, approver_id,
-- and entity_id — only the step reference is lost.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_flow_step_id_fkey;

ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_requests_flow_step_id_fkey
    FOREIGN KEY (flow_step_id)
    REFERENCES public.approval_flow_steps(id)
    ON DELETE SET NULL;
