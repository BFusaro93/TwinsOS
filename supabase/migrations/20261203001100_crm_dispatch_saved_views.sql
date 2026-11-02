-- Dispatch board "saved screen views": a named snapshot of the board's filter
-- state (service/crew/status/priority/tag filters, search, columns, a relative
-- date mode) that a user can re-apply in one click. Per user, not shared.

CREATE TABLE IF NOT EXISTS public.crm_dispatch_saved_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL DEFAULT my_org_id() REFERENCES public.organizations(id),
  user_id    uuid NOT NULL DEFAULT auth.uid(),
  name       text NOT NULL,
  board      text NOT NULL DEFAULT 'dispatch' CHECK (board IN ('dispatch')),
  filters    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Live-row uniqueness only, so a soft-deleted name can be reused.
CREATE UNIQUE INDEX IF NOT EXISTS crm_dispatch_saved_views_name_uniq
  ON public.crm_dispatch_saved_views (org_id, user_id, name)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS crm_dispatch_saved_views_set_updated_at ON public.crm_dispatch_saved_views;
CREATE TRIGGER crm_dispatch_saved_views_set_updated_at
  BEFORE UPDATE ON public.crm_dispatch_saved_views
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.crm_dispatch_saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own saved views select" ON public.crm_dispatch_saved_views;
CREATE POLICY "own saved views select"
  ON public.crm_dispatch_saved_views FOR SELECT
  USING (org_id = my_org_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS "own saved views insert" ON public.crm_dispatch_saved_views;
CREATE POLICY "own saved views insert"
  ON public.crm_dispatch_saved_views FOR INSERT
  WITH CHECK (org_id = my_org_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS "own saved views update" ON public.crm_dispatch_saved_views;
CREATE POLICY "own saved views update"
  ON public.crm_dispatch_saved_views FOR UPDATE
  USING (org_id = my_org_id() AND user_id = auth.uid())
  WITH CHECK (org_id = my_org_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS "own saved views delete" ON public.crm_dispatch_saved_views;
CREATE POLICY "own saved views delete"
  ON public.crm_dispatch_saved_views FOR DELETE
  USING (org_id = my_org_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS "require_crm_access" ON public.crm_dispatch_saved_views;
CREATE POLICY "require_crm_access"
  ON public.crm_dispatch_saved_views AS RESTRICTIVE FOR ALL
  USING (public.has_crm_access()) WITH CHECK (public.has_crm_access());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_dispatch_saved_views TO authenticated;
