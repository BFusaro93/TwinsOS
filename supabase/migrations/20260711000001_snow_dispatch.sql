-- Snow dispatching (core): Storm Events + Master Routes.
--
-- crm_jobs already supports job_type = 'snow' with inch_trigger/invoice_type,
-- and crm_job_visits already supports crew assignment + status cycling, but
-- there was no "storm event" concept to group snow visits under, no
-- persisted Master Routes (Settings > Snow Routes was client-side-only
-- useCategoryList state, never written to the DB), and no per-visit fields
-- for the snow-specific close-out data (actual depth, temperature, asset
-- type, materials used).

-- ── crm_storm_events ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crm_storm_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES public.organizations(id),
  name                   text NOT NULL,
  event_date             date NOT NULL,
  dispatch_status        text NOT NULL DEFAULT 'pending' CHECK (dispatch_status IN ('pending', 'working', 'complete')),
  forecast_depth_inches  numeric,
  temperature            numeric,
  notes                  text,
  is_active              boolean NOT NULL DEFAULT true,
  created_by             uuid REFERENCES auth.users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);

ALTER TABLE public.crm_storm_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage storm_events"
  ON public.crm_storm_events FOR ALL
  USING (org_id = my_org_id()) WITH CHECK (org_id = my_org_id());

CREATE TRIGGER trg_crm_storm_events_updated_at
  BEFORE UPDATE ON public.crm_storm_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── crm_snow_routes (Master Routes) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crm_snow_routes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.organizations(id),
  name             text NOT NULL,
  default_crew_id  uuid REFERENCES public.crm_crews(id),
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

ALTER TABLE public.crm_snow_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage snow_routes"
  ON public.crm_snow_routes FOR ALL
  USING (org_id = my_org_id()) WITH CHECK (org_id = my_org_id());

CREATE TRIGGER trg_crm_snow_routes_updated_at
  BEFORE UPDATE ON public.crm_snow_routes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── crm_snow_route_stops (ordered stops on a Master Route) ──────────────────

CREATE TABLE IF NOT EXISTS public.crm_snow_route_stops (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id),
  route_id    uuid NOT NULL REFERENCES public.crm_snow_routes(id) ON DELETE CASCADE,
  job_id      uuid NOT NULL REFERENCES public.crm_jobs(id),
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, job_id)
);

ALTER TABLE public.crm_snow_route_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage snow_route_stops"
  ON public.crm_snow_route_stops FOR ALL
  USING (org_id = my_org_id()) WITH CHECK (org_id = my_org_id());

-- ── crm_job_visits: per-visit snow service entry ────────────────────────────

ALTER TABLE public.crm_job_visits
  ADD COLUMN IF NOT EXISTS storm_event_id     uuid REFERENCES public.crm_storm_events(id),
  ADD COLUMN IF NOT EXISTS snow_depth_inches  numeric,
  ADD COLUMN IF NOT EXISTS temperature        numeric,
  ADD COLUMN IF NOT EXISTS asset_type         text,
  ADD COLUMN IF NOT EXISTS materials_used     jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_crm_job_visits_storm_event_id
  ON public.crm_job_visits (storm_event_id) WHERE storm_event_id IS NOT NULL;

-- ── crm_jobs: day-of-week authorization exclusion filter ────────────────────

ALTER TABLE public.crm_jobs
  ADD COLUMN IF NOT EXISTS snow_days_authorized text[];
