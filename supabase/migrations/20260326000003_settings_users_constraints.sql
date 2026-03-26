-- =============================================================================
-- MIGRATION: Org settings columns, profiles status, admin policy, unique indexes
-- =============================================================================

-- ─── 1. Organizations — settings columns ─────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_color      text         NOT NULL DEFAULT '#60ab45',
  ADD COLUMN IF NOT EXISTS address          jsonb        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tax_rate_percent numeric(5,2) NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS cost_method      text         NOT NULL DEFAULT 'manual'
    CHECK (cost_method IN ('manual', 'wac', 'fifo')),
  ADD COLUMN IF NOT EXISTS portal_enabled   boolean      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS customizations   jsonb        NOT NULL DEFAULT '{}'::jsonb;

-- ─── 2. Profiles — user status ───────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invited', 'inactive'));

-- ─── 3. RLS — admins can update any profile within their org ─────────────────
-- (The existing policy only allows users to update their own profile.)

CREATE POLICY "admins_manage_org_profiles" ON public.profiles
  FOR UPDATE
  USING (
    org_id = public.my_org_id()
    AND EXISTS (
      SELECT 1
      FROM   public.profiles AS p
      WHERE  p.id     = auth.uid()
        AND  p.org_id = public.my_org_id()
        AND  p.role   = 'admin'
    )
  );

-- ─── 4. Unique indexes (partial — exclude soft-deleted rows) ─────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_items_org_part_number
  ON public.product_items (org_id, part_number)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parts_org_part_number
  ON public.parts (org_id, part_number)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_org_asset_tag
  ON public.assets (org_id, asset_tag)
  WHERE deleted_at IS NULL;

-- VIN is nullable, only enforce uniqueness when present
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_org_vin
  ON public.vehicles (org_id, vin)
  WHERE vin IS NOT NULL AND deleted_at IS NULL;
