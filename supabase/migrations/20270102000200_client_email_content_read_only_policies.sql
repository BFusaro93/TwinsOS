-- client_email_content (20270102000100) shipped without the RESTRICTIVE
-- read_only_when_canceled_* policies every org-scoped table needs, so a canceled
-- org / expired trial could still write to it (the migration-drift check
-- "enforces read-only mode" fails on it). Same statements as the DO block in
-- 20261220000600, scoped to this one table.

DROP POLICY IF EXISTS read_only_when_canceled_ins ON public.client_email_content;
DROP POLICY IF EXISTS read_only_when_canceled_upd ON public.client_email_content;
DROP POLICY IF EXISTS read_only_when_canceled_del ON public.client_email_content;

CREATE POLICY read_only_when_canceled_ins ON public.client_email_content AS RESTRICTIVE FOR INSERT
  WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE);
CREATE POLICY read_only_when_canceled_upd ON public.client_email_content AS RESTRICTIVE FOR UPDATE
  USING ((SELECT my_org_is_read_only()) IS NOT TRUE)
  WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE);
CREATE POLICY read_only_when_canceled_del ON public.client_email_content AS RESTRICTIVE FOR DELETE
  USING ((SELECT my_org_is_read_only()) IS NOT TRUE);
