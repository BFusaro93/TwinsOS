-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: enforce_approval_chain_order
--
-- CLAUDE.md requires "only the current approver in the chain can approve/
-- reject" to be enforced server-side, but only_approver_can_update (see
-- 20260326000002_approval_requests_update_rls.sql) only ever checked
-- `approver_id = auth.uid()` — nothing checked that every earlier-`order`
-- step for the same entity was already resolved. A step-2+ approver could
-- approve their own row via a direct Supabase call before step 1 acted,
-- bypassing the sequential chain the UI (ApprovalChain.tsx) only enforces
-- client-side.
--
-- Replaces the policy with one that additionally requires no earlier-order
-- row for the same entity to still be 'pending' — UNLESS the acting user is
-- an admin/manager, who must keep the existing override capability (e.g.
-- reassigning a stuck approval) regardless of ordering.
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
      -- still pending.
      approver_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1
        FROM public.approval_requests earlier
        WHERE earlier.entity_type = approval_requests.entity_type
          AND earlier.entity_id   = approval_requests.entity_id
          AND earlier."order"     < approval_requests."order"
          AND earlier.status      = 'pending'
      )
    )
    OR
    -- Admins and managers can override (e.g. reassigning a stuck approval)
    -- regardless of chain position — that's the point of an override.
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id     = auth.uid()
        AND profiles.org_id = public.my_org_id()
        AND profiles.role   IN ('admin', 'manager')
    )
  );
