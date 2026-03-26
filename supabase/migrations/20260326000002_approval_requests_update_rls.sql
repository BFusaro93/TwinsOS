-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: approval_requests_update_rls
--
-- The existing "org_members_approval_requests" policy grants FOR ALL, which
-- means any org member can UPDATE any approval_request row — including their
-- own requisitions. This migration adds a RESTRICTIVE policy on UPDATE so that
-- only the assigned approver (or an admin/manager) can mark a decision.
--
-- RESTRICTIVE policies combine with AND, not OR, against the permissive FOR ALL
-- policy above. A row is updatable only when BOTH policies pass.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "only_approver_can_update"
  ON public.approval_requests
  AS RESTRICTIVE
  FOR UPDATE
  USING (
    -- The assigned approver acting on their own request
    approver_id = auth.uid()
    OR
    -- Admins and managers can override (e.g. reassigning a stuck approval)
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id     = auth.uid()
        AND profiles.org_id = public.my_org_id()
        AND profiles.role   IN ('admin', 'manager')
    )
  );
