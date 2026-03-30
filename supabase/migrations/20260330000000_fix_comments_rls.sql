-- Fix comments RLS policy to allow INSERTs.
-- The original policy used FOR ALL USING(...) without WITH CHECK(...),
-- which blocks INSERT operations since USING only applies to
-- SELECT/UPDATE/DELETE.

DROP POLICY IF EXISTS "org_members_comments" ON public.comments;

CREATE POLICY "org_members_comments" ON public.comments
  FOR ALL
  USING (org_id = public.my_org_id())
  WITH CHECK (org_id = public.my_org_id());
