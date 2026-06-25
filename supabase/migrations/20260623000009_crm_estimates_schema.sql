-- Estimates module: estimates, estimate_line_items, estimate_direct_costs,
-- estimate_templates, estimate_template_items
-- Applied via Supabase MCP (apply_migration) on 2026-06-23.

-- ── estimates ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.estimates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  estimate_number     serial,
  client_id           uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  sales_rep_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  description         text NOT NULL DEFAULT '',
  source              text,
  est_document        text NOT NULL DEFAULT 'default',
  stage               text NOT NULL DEFAULT 'draft'
                        CHECK (stage IN ('draft','quote','sent','approved','won','lost','invoiced')),
  show_discounts      boolean NOT NULL DEFAULT false,
  estimate_date       date NOT NULL,
  valid_until_date    date,
  num_installments    integer NOT NULL DEFAULT 1,
  po_number           text,
  work_order_number   text,
  notes               text,
  subtotal_cents      integer NOT NULL DEFAULT 0,
  discount_cents      integer NOT NULL DEFAULT 0,
  tax_rate_bps        integer NOT NULL DEFAULT 0,
  tax_cents           integer NOT NULL DEFAULT 0,
  total_cents         integer NOT NULL DEFAULT 0,
  revenue_cents       integer NOT NULL DEFAULT 0,
  overhead_rate_bps   integer NOT NULL DEFAULT 1500,
  overhead_cost_cents integer NOT NULL DEFAULT 0,
  gross_profit_cents  integer NOT NULL DEFAULT 0,
  net_profit_cents    integer NOT NULL DEFAULT 0,
  total_budgeted_hours numeric(10,2) NOT NULL DEFAULT 0,
  probability_bps     integer NOT NULL DEFAULT 5000,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TRIGGER trg_estimates_updated_at
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage estimates" ON public.estimates
  FOR ALL USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- ── estimate_line_items ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.estimate_line_items (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  estimate_id                 uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  service_id                  uuid REFERENCES public.crm_services(id) ON DELETE SET NULL,
  service_name                text NOT NULL,
  status                      text NOT NULL DEFAULT 'quote'
                                CHECK (status IN ('quote','draft','won','lost')),
  calc_type                   smallint NOT NULL DEFAULT 1,
  qty                         numeric(10,4) NOT NULL DEFAULT 1,
  unit_type                   text,
  production_rate_sqft_per_hr numeric(10,2),
  rate_cents                  integer NOT NULL DEFAULT 0,
  adj_rate_cents              integer,
  visits                      integer NOT NULL DEFAULT 1,
  budgeted_hours              numeric(10,2) NOT NULL DEFAULT 0,
  total_budgeted_hours        numeric(10,2) NOT NULL DEFAULT 0,
  cost_cents                  integer NOT NULL DEFAULT 0,
  total_cost_cents            integer NOT NULL DEFAULT 0,
  total_cents                 integer NOT NULL DEFAULT 0,
  margin_bps                  integer NOT NULL DEFAULT 0,
  markup_bps                  integer NOT NULL DEFAULT 0,
  sort_order                  integer NOT NULL DEFAULT 0,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_estimate_line_items_updated_at
  BEFORE UPDATE ON public.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage estimate_line_items" ON public.estimate_line_items
  FOR ALL USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- ── estimate_direct_costs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.estimate_direct_costs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  estimate_id     uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  description     text NOT NULL,
  cost_type       text NOT NULL DEFAULT 'other'
                    CHECK (cost_type IN ('labor','sub_contract','service','product_material','asset_equipment','other')),
  qty             numeric(10,4) NOT NULL DEFAULT 1,
  rate_cents      integer NOT NULL DEFAULT 0,
  total_cents     integer NOT NULL DEFAULT 0,
  overhead_cents  integer NOT NULL DEFAULT 0,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_estimate_direct_costs_updated_at
  BEFORE UPDATE ON public.estimate_direct_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.estimate_direct_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage estimate_direct_costs" ON public.estimate_direct_costs
  FOR ALL USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- ── estimate_templates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.estimate_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name         text NOT NULL,
  est_document text NOT NULL DEFAULT 'default',
  show_discounts boolean NOT NULL DEFAULT false,
  show_when    text NOT NULL DEFAULT 'estimates' CHECK (show_when IN ('estimates','jobs','both')),
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.estimate_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage estimate_templates" ON public.estimate_templates
  FOR ALL USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- ── estimate_template_items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.estimate_template_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id  uuid NOT NULL REFERENCES public.estimate_templates(id) ON DELETE CASCADE,
  service_id   uuid REFERENCES public.crm_services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  calc_type    smallint NOT NULL DEFAULT 1,
  qty          numeric(10,4) NOT NULL DEFAULT 1,
  rate_cents   integer NOT NULL DEFAULT 0,
  visits       integer NOT NULL DEFAULT 1,
  budgeted_hours numeric(10,2) NOT NULL DEFAULT 0,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.estimate_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage estimate_template_items" ON public.estimate_template_items
  FOR ALL USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
