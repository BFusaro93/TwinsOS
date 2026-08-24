-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill migration: project_direct_items, project_subcontract_costs, and
-- projects.is_archived were all created directly against prod in an earlier
-- session with no committed migration file, so this repo could never
-- reproduce prod's schema (the test project never got them, breaking
-- PostgREST embeds/filters against them). Reconstructed from prod's live
-- schema. CREATE/ADD ... IF NOT EXISTS so this is a no-op on prod and only
-- actually applies on test/any fresh env.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.project_direct_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id),
  project_id        uuid NOT NULL REFERENCES public.projects(id),
  product_item_id   uuid REFERENCES public.product_items(id),
  product_item_name text NOT NULL DEFAULT '',
  part_number       text NOT NULL DEFAULT '',
  quantity          numeric NOT NULL DEFAULT 1,
  unit_cost         integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  created_by        uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.project_direct_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can manage project_direct_items" ON public.project_direct_items;
CREATE POLICY "org members can manage project_direct_items"
  ON public.project_direct_items
  FOR ALL
  USING (org_id = (SELECT profiles.org_id FROM public.profiles WHERE profiles.id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.project_subcontract_costs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id),
  project_id   uuid NOT NULL REFERENCES public.projects(id),
  vendor_id    uuid REFERENCES public.vendors(id),
  vendor_name  text NOT NULL,
  description  text NOT NULL,
  cost_type    text NOT NULL CHECK (cost_type = ANY (ARRAY['materials'::text, 'labor'::text, 'other'::text])),
  amount       integer NOT NULL DEFAULT 0,
  cost_date    date,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id),
  deleted_at   timestamptz
);

ALTER TABLE public.project_subcontract_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can select project_subcontract_costs" ON public.project_subcontract_costs;
CREATE POLICY "org members can select project_subcontract_costs"
  ON public.project_subcontract_costs
  FOR SELECT
  USING (org_id = (SELECT profiles.org_id FROM public.profiles WHERE profiles.id = auth.uid()));

DROP POLICY IF EXISTS "org members can insert project_subcontract_costs" ON public.project_subcontract_costs;
CREATE POLICY "org members can insert project_subcontract_costs"
  ON public.project_subcontract_costs
  FOR INSERT
  WITH CHECK (org_id = (SELECT profiles.org_id FROM public.profiles WHERE profiles.id = auth.uid()));

DROP POLICY IF EXISTS "org members can update project_subcontract_costs" ON public.project_subcontract_costs;
CREATE POLICY "org members can update project_subcontract_costs"
  ON public.project_subcontract_costs
  FOR UPDATE
  USING (org_id = (SELECT profiles.org_id FROM public.profiles WHERE profiles.id = auth.uid()));
