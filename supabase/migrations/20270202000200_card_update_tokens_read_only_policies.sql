-- Read-only (canceled / expired org) enforcement for card_update_tokens, which
-- 20270202000100 created after the last backfill. Same three RESTRICTIVE policies
-- the migration-drift check requires on every org-scoped table.

DROP POLICY IF EXISTS read_only_when_canceled_ins ON public.card_update_tokens;
DROP POLICY IF EXISTS read_only_when_canceled_upd ON public.card_update_tokens;
DROP POLICY IF EXISTS read_only_when_canceled_del ON public.card_update_tokens;

CREATE POLICY read_only_when_canceled_ins ON public.card_update_tokens AS RESTRICTIVE FOR INSERT
  WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE);
CREATE POLICY read_only_when_canceled_upd ON public.card_update_tokens AS RESTRICTIVE FOR UPDATE
  USING ((SELECT my_org_is_read_only()) IS NOT TRUE)
  WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE);
CREATE POLICY read_only_when_canceled_del ON public.card_update_tokens AS RESTRICTIVE FOR DELETE
  USING ((SELECT my_org_is_read_only()) IS NOT TRUE);
