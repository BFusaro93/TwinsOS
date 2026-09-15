-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: approval_requests_require_active_approver
--
-- Bug 4 (approval-flow bug sweep, 2026-09-02): approver identity/role is
-- snapshotted onto approval_requests at submission time and never
-- re-validated. If a user is later demoted or deactivated (profiles.status
-- flips away from 'active' — this app has no profiles.deleted_at column,
-- see src/components/settings/UsersPage.tsx for the 'active' | 'invited' |
-- 'inactive' status values), only_approver_can_update
-- (20260803042625_enforce_approval_chain_order.sql) still lets them action
-- their stale approval_requests row: it only checks approver_id = auth.uid()
-- plus chain order, never profiles.status.
--
-- Adds an additional requirement to both branches of the policy: the acting
-- user's own profiles.status must be 'active'. A deactivated admin/manager
-- loses override capability too — that's intentional, a deactivated account
-- shouldn't be able to act at all.
--
-- Client-side, useDecideApproval (src/lib/hooks/use-approval-requests.ts)
-- now also re-fetches the acting user's profile status immediately before
-- attempting the decision and throws a clear error instead of surfacing a
-- generic PGRST116/RLS failure.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "only_approver_can_update" ON public.approval_requests;

CREATE POLICY "only_approver_can_update"
  ON public.approval_requests
  AS RESTRICTIVE
  FOR UPDATE
  USING (
    (
      -- The assigned approver acting on their own request — but only once
      -- it's actually their turn: no earlier step for this same entity is
      -- still pending — AND only while their own account is still active.
      approver_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1
        FROM public.approval_requests earlier
        WHERE earlier.entity_type = approval_requests.entity_type
          AND earlier.entity_id   = approval_requests.entity_id
          AND earlier."order"     < approval_requests."order"
          AND earlier.status      = 'pending'
      )
      AND EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id     = auth.uid()
          AND profiles.status = 'active'
      )
    )
    OR
    -- Admins and managers can override (e.g. reassigning a stuck approval)
    -- regardless of chain position — that's the point of an override — but
    -- only while their own account is still active.
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id     = auth.uid()
        AND profiles.org_id = public.my_org_id()
        AND profiles.role   IN ('admin', 'manager')
        AND profiles.status = 'active'
    )
  );
