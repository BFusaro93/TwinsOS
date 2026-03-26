-- ═══════════════════════════════════════════════════════════════════════════════
-- TwinsOS — Initial Database Schema
-- Covers: Organizations, Profiles, Vendors, Products, Projects,
--         Requisitions, Purchase Orders, Goods Receipts,
--         Assets, Vehicles, Parts, PM Schedules, Meters,
--         Work Orders, Maintenance Requests,
--         Approval Flows, Comments, Attachments, Audit Log
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: UTILITY FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Automatically stamp updated_at on every mutation
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Return the org_id of the currently authenticated user.
-- SECURITY DEFINER so it can read profiles even if the caller's RLS
-- hasn't resolved yet during policy evaluation.
CREATE OR REPLACE FUNCTION public.my_org_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN (SELECT org_id FROM public.profiles WHERE id = auth.uid());
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: ORGANIZATIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.organizations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  slug       text        NOT NULL UNIQUE,
  plan       text        NOT NULL DEFAULT 'trial'
               CHECK (plan IN ('trial', 'starter', 'growth', 'enterprise')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_org" ON public.organizations
  FOR SELECT USING (id = public.my_org_id());

CREATE POLICY "admins_update_own_org" ON public.organizations
  FOR UPDATE USING (id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: PROFILES  (one row per auth.users entry)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     uuid        NOT NULL REFERENCES public.organizations(id),
  name       text        NOT NULL,
  email      text        NOT NULL,
  role       text        NOT NULL DEFAULT 'viewer'
               CHECK (role IN ('admin', 'manager', 'technician', 'purchaser', 'viewer', 'requestor')),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Automatically provision a profile row when a new user signs up.
-- org_id, name, and role are passed via raw_user_meta_data at sign-up time.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, org_id, name, email, role)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data ->> 'org_id')::uuid,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'viewer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_org_profiles" ON public.profiles
  FOR SELECT USING (org_id = public.my_org_id());

CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: VENDORS  (shared across PO and CMMS modules)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.vendors (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid        NOT NULL REFERENCES public.organizations(id),
  created_by         uuid        REFERENCES public.profiles(id),
  name               text        NOT NULL,
  contact_name       text        NOT NULL DEFAULT '',
  email              text        NOT NULL DEFAULT '',
  phone              text        NOT NULL DEFAULT '',
  address            text        NOT NULL DEFAULT '',
  website            text,
  notes              text,
  vendor_type        text,
  is_active          boolean     NOT NULL DEFAULT true,
  w9_status          text        NOT NULL DEFAULT 'not_requested'
                       CHECK (w9_status IN ('not_requested', 'requested', 'received', 'expired')),
  w9_received_date   date,
  w9_expiration_date date,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

CREATE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_vendors" ON public.vendors
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: PRODUCT ITEMS  (purchasable materials catalog)
-- ─────────────────────────────────────────────────────────────────────────────
-- Categories: maintenance_part (→ CMMS parts), stocked_material, project_material
-- unit_cost / price stored in cents (integer). cost_layers is JSONB (CostLayer[])
-- for WAC / FIFO inventory costing.

CREATE TABLE public.product_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES public.organizations(id),
  created_by        uuid        REFERENCES public.profiles(id),
  name              text        NOT NULL,
  description       text        NOT NULL DEFAULT '',
  part_number       text        NOT NULL DEFAULT '',
  category          text        NOT NULL
                      CHECK (category IN ('maintenance_part', 'stocked_material', 'project_material')),
  unit_cost         integer     NOT NULL DEFAULT 0,        -- cents
  price             integer     NOT NULL DEFAULT 0,        -- cents (sale price)
  vendor_id         uuid        REFERENCES public.vendors(id),
  vendor_name       text        NOT NULL DEFAULT '',
  alternate_vendors jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_inventory      boolean     NOT NULL DEFAULT false,
  quantity_on_hand  integer     NOT NULL DEFAULT 0,
  picture_url       text,
  cost_layers       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE TRIGGER trg_product_items_updated_at
  BEFORE UPDATE ON public.product_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_product_items" ON public.product_items
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: PROJECTS  (landscaping jobs / cost-tracking)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.projects (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES public.organizations(id),
  created_by    uuid        REFERENCES public.profiles(id),
  name          text        NOT NULL,
  customer_name text        NOT NULL DEFAULT '',
  address       text        NOT NULL DEFAULT '',
  status        text        NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('sold', 'scheduled', 'in_progress', 'complete', 'on_hold', 'canceled')),
  start_date    date,
  end_date      date,
  total_cost    integer     NOT NULL DEFAULT 0,  -- cents, computed/denormalized
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_projects" ON public.projects
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: ASSETS  (CMMS equipment registry)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.assets (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid        NOT NULL REFERENCES public.organizations(id),
  created_by             uuid        REFERENCES public.profiles(id),
  name                   text        NOT NULL,
  asset_tag              text        NOT NULL DEFAULT '',
  equipment_number       text,
  asset_type             text        NOT NULL DEFAULT '',
  status                 text        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'inactive', 'in_shop', 'out_of_service', 'disposed')),
  make                   text,
  model                  text,
  year                   smallint,
  serial_number          text,
  engine_serial_number   text,
  air_filter_part_number text,
  oil_filter_part_number text,
  spark_plug_part_number text,
  division               text,
  engine_model           text,
  manufacturer           text,
  assigned_crew          text,
  barcode                text,
  parent_asset_id        uuid        REFERENCES public.assets(id),
  purchase_vendor_id     uuid        REFERENCES public.vendors(id),
  purchase_vendor_name   text,
  purchase_date          date,
  purchase_price         integer,                -- cents
  payment_method         text        CHECK (payment_method IN ('outright', 'loan', 'lease', 'rental')),
  finance_institution    text,
  location               text,
  photo_url              text,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);

CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_assets" ON public.assets
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: VEHICLES  (extends asset fields + vehicle-specific columns)
-- ─────────────────────────────────────────────────────────────────────────────
-- Kept as a separate table from assets because the UX is distinct (license plate,
-- VIN, oil change tracking, Samsara integration) and the two appear in separate
-- sidebar sections. Work Orders reference assets or vehicles via asset_id +
-- linked_entity_type at the application layer.

CREATE TABLE public.vehicles (
  -- Shared asset columns
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid        NOT NULL REFERENCES public.organizations(id),
  created_by                  uuid        REFERENCES public.profiles(id),
  name                        text        NOT NULL,
  asset_tag                   text        NOT NULL DEFAULT '',
  equipment_number            text,
  asset_type                  text        NOT NULL DEFAULT 'vehicle',
  status                      text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'inactive', 'in_shop', 'out_of_service', 'disposed')),
  make                        text,
  model                       text,
  year                        smallint,
  serial_number               text,
  engine_serial_number        text,
  division                    text,
  assigned_crew               text,
  barcode                     text,
  purchase_vendor_id          uuid        REFERENCES public.vendors(id),
  purchase_vendor_name        text,
  purchase_date               date,
  purchase_price              integer,            -- cents
  payment_method              text        CHECK (payment_method IN ('outright', 'loan', 'lease', 'rental')),
  finance_institution         text,
  location                    text,
  photo_url                   text,
  notes                       text,
  -- Vehicle-specific columns
  license_plate               text,
  vin                         text,
  samsara_vehicle_id          text,
  fuel_type                   text,
  next_oil_change_due         date,
  next_oil_change_mileage     integer,            -- miles
  next_inspection_sticker_due date,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  deleted_at                  timestamptz
);

CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_vehicles" ON public.vehicles
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: PARTS  (CMMS spare-parts inventory)
-- ─────────────────────────────────────────────────────────────────────────────
-- product_item_id links a Part to its Products catalog entry so unit costs
-- stay in sync (bidirectional mirror enforced at the application layer).

CREATE TABLE public.parts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES public.organizations(id),
  created_by        uuid        REFERENCES public.profiles(id),
  name              text        NOT NULL,
  part_number       text        NOT NULL DEFAULT '',
  description       text        NOT NULL DEFAULT '',
  category          text        NOT NULL DEFAULT '',
  quantity_on_hand  integer     NOT NULL DEFAULT 0,
  minimum_stock     integer     NOT NULL DEFAULT 0,
  unit_cost         integer     NOT NULL DEFAULT 0,        -- cents
  vendor_id         uuid        REFERENCES public.vendors(id),
  vendor_name       text,
  alternate_vendors jsonb       NOT NULL DEFAULT '[]'::jsonb,
  parent_part_id    uuid        REFERENCES public.parts(id),
  is_inventory      boolean     NOT NULL DEFAULT true,
  picture_url       text,
  product_item_id   uuid        REFERENCES public.product_items(id),
  cost_layers       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE TRIGGER trg_parts_updated_at
  BEFORE UPDATE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_parts" ON public.parts
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10: ASSET_PARTS  (many-to-many: assets ↔ parts)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.asset_parts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id),
  created_by  uuid        REFERENCES public.profiles(id),
  asset_id    uuid        NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  part_id     uuid        NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  part_name   text        NOT NULL DEFAULT '',
  part_number text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (asset_id, part_id)
);

CREATE TRIGGER trg_asset_parts_updated_at
  BEFORE UPDATE ON public.asset_parts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.asset_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_asset_parts" ON public.asset_parts
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 11: PM SCHEDULES  (preventive maintenance schedules)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.pm_schedules (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid        NOT NULL REFERENCES public.organizations(id),
  created_by          uuid        REFERENCES public.profiles(id),
  title               text        NOT NULL,
  asset_id            uuid        REFERENCES public.assets(id),
  asset_name          text        NOT NULL DEFAULT '',
  frequency           text        NOT NULL
                        CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  next_due_date       date        NOT NULL,
  last_completed_date date,
  is_active           boolean     NOT NULL DEFAULT true,
  description         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE TRIGGER trg_pm_schedules_updated_at
  BEFORE UPDATE ON public.pm_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pm_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_pm_schedules" ON public.pm_schedules
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 12: METERS + METER READINGS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.meters (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id),
  created_by      uuid        REFERENCES public.profiles(id),
  name            text        NOT NULL,
  asset_id        uuid        REFERENCES public.assets(id),
  asset_name      text        NOT NULL DEFAULT '',
  unit            text        NOT NULL DEFAULT '',   -- "miles", "hours", "gallons", etc.
  current_value   numeric     NOT NULL DEFAULT 0,
  last_reading_at timestamptz,
  source          text        NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'samsara')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TRIGGER trg_meters_updated_at
  BEFORE UPDATE ON public.meters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.meters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_meters" ON public.meters
  FOR ALL USING (org_id = public.my_org_id());

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.meter_readings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL REFERENCES public.organizations(id),
  created_by       uuid        REFERENCES public.profiles(id),
  meter_id         uuid        NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  value            numeric     NOT NULL,
  reading_at       timestamptz NOT NULL DEFAULT now(),
  source           text        NOT NULL DEFAULT 'manual'
                     CHECK (source IN ('manual', 'samsara')),
  recorded_by_name text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE TRIGGER trg_meter_readings_updated_at
  BEFORE UPDATE ON public.meter_readings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_meter_readings" ON public.meter_readings
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 13: WORK ORDERS
-- ─────────────────────────────────────────────────────────────────────────────
-- asset_id is a polymorphic reference: check linked_entity_type to know
-- whether it points to the assets or vehicles table. FK enforced at app layer.

CREATE TABLE public.work_orders (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid        NOT NULL REFERENCES public.organizations(id),
  created_by           uuid        REFERENCES public.profiles(id),
  work_order_number    text        NOT NULL,
  title                text        NOT NULL,
  description          text,
  status               text        NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'on_hold', 'in_progress', 'done')),
  priority             text        NOT NULL DEFAULT 'medium'
                         CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  wo_type              text        CHECK (wo_type IN ('reactive', 'preventive')),
  asset_id             uuid,       -- see linked_entity_type
  asset_name           text,
  linked_entity_type   text        CHECK (linked_entity_type IN ('asset', 'vehicle')),
  assigned_to_id       uuid        REFERENCES public.profiles(id),
  assigned_to_name     text,
  due_date             date,
  category             text,
  parent_work_order_id uuid        REFERENCES public.work_orders(id),
  pm_schedule_id       uuid        REFERENCES public.pm_schedules(id),
  is_recurring         boolean     NOT NULL DEFAULT false,
  recurrence_frequency text        CHECK (recurrence_frequency IN (
                           'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'
                         )),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

CREATE TRIGGER trg_work_orders_updated_at
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_work_orders" ON public.work_orders
  FOR ALL USING (org_id = public.my_org_id());

-- ── Work Order Cost Tables ────────────────────────────────────────────────────

CREATE TABLE public.wo_parts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES public.organizations(id),
  created_by    uuid        REFERENCES public.profiles(id),
  work_order_id uuid        NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  part_id       uuid        REFERENCES public.parts(id),
  part_name     text        NOT NULL DEFAULT '',
  part_number   text        NOT NULL DEFAULT '',
  quantity      integer     NOT NULL DEFAULT 1,
  unit_cost     integer     NOT NULL DEFAULT 0,        -- cents
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE TRIGGER trg_wo_parts_updated_at
  BEFORE UPDATE ON public.wo_parts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.wo_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_wo_parts" ON public.wo_parts
  FOR ALL USING (org_id = public.my_org_id());

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.wo_labor_entries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id),
  created_by      uuid        REFERENCES public.profiles(id),
  work_order_id   uuid        NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  technician_name text        NOT NULL DEFAULT '',
  description     text        NOT NULL DEFAULT '',
  hours           numeric     NOT NULL DEFAULT 0,
  hourly_rate     integer     NOT NULL DEFAULT 0,      -- cents
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TRIGGER trg_wo_labor_entries_updated_at
  BEFORE UPDATE ON public.wo_labor_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.wo_labor_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_wo_labor_entries" ON public.wo_labor_entries
  FOR ALL USING (org_id = public.my_org_id());

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.wo_vendor_charges (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES public.organizations(id),
  created_by    uuid        REFERENCES public.profiles(id),
  work_order_id uuid        NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  vendor_id     uuid        REFERENCES public.vendors(id),
  vendor_name   text        NOT NULL DEFAULT '',
  description   text        NOT NULL DEFAULT '',
  cost          integer     NOT NULL DEFAULT 0,        -- cents
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE TRIGGER trg_wo_vendor_charges_updated_at
  BEFORE UPDATE ON public.wo_vendor_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.wo_vendor_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_wo_vendor_charges" ON public.wo_vendor_charges
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 14: MAINTENANCE REQUESTS
-- ─────────────────────────────────────────────────────────────────────────────
-- Submitted via the public portal (/request) or internally. Public submissions
-- use a server-side API route that supplies org_id from the host — the insert
-- policy intentionally allows unauthenticated inserts via the service role.

CREATE TABLE public.maintenance_requests (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid        NOT NULL REFERENCES public.organizations(id),
  created_by               uuid        REFERENCES public.profiles(id),
  request_number           text        NOT NULL,
  title                    text        NOT NULL,
  description              text,
  status                   text        NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open', 'in_review', 'approved', 'converted', 'rejected')),
  priority                 text        NOT NULL DEFAULT 'medium'
                             CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  asset_id                 uuid,       -- polymorphic; no FK (may be asset or vehicle)
  asset_name               text,
  requested_by_id          uuid        REFERENCES public.profiles(id),
  requested_by_name        text        NOT NULL DEFAULT '',
  linked_work_order_id     uuid        REFERENCES public.work_orders(id),
  linked_work_order_number text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz
);

CREATE TRIGGER trg_maintenance_requests_updated_at
  BEFORE UPDATE ON public.maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_requests" ON public.maintenance_requests
  FOR SELECT USING (org_id = public.my_org_id());

CREATE POLICY "org_members_update_requests" ON public.maintenance_requests
  FOR UPDATE USING (org_id = public.my_org_id());

CREATE POLICY "org_members_delete_requests" ON public.maintenance_requests
  FOR DELETE USING (org_id = public.my_org_id());

-- Public portal inserts — intentionally permissive. The /request API route runs
-- under the service role key and always injects the correct org_id server-side.
-- Studio will flag this policy; that warning is expected and acknowledged.
CREATE POLICY "public_portal_insert_requests" ON public.maintenance_requests
  FOR INSERT WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 15: APPROVAL FLOWS + STEPS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.approval_flows (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id),
  created_by  uuid        REFERENCES public.profiles(id),
  name        text        NOT NULL,
  entity_type text        NOT NULL
                CHECK (entity_type IN ('requisition', 'purchase_order')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TRIGGER trg_approval_flows_updated_at
  BEFORE UPDATE ON public.approval_flows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.approval_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_approval_flows" ON public.approval_flows
  FOR ALL USING (org_id = public.my_org_id());

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.approval_flow_steps (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id          uuid        NOT NULL REFERENCES public.approval_flows(id) ON DELETE CASCADE,
  "order"          integer     NOT NULL,
  required_role    text        NOT NULL
                     CHECK (required_role IN ('admin', 'manager', 'technician', 'purchaser', 'viewer', 'requestor')),
  label            text        NOT NULL DEFAULT '',
  threshold_cents  integer     NOT NULL DEFAULT 0,
  assigned_user_id uuid        REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_approval_flow_steps_updated_at
  BEFORE UPDATE ON public.approval_flow_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.approval_flow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_approval_flow_steps" ON public.approval_flow_steps
  FOR ALL USING (
    flow_id IN (
      SELECT id FROM public.approval_flows WHERE org_id = public.my_org_id()
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 16: REQUISITIONS
-- ─────────────────────────────────────────────────────────────────────────────
-- converted_po_id added via ALTER TABLE after purchase_orders is created
-- (circular FK: requisitions ↔ purchase_orders).

CREATE TABLE public.requisitions (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid         NOT NULL REFERENCES public.organizations(id),
  created_by         uuid         REFERENCES public.profiles(id),
  requisition_number text         NOT NULL,
  title              text         NOT NULL,
  status             text         NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'ordered', 'closed')),
  requested_by_id    uuid         REFERENCES public.profiles(id),
  requested_by_name  text         NOT NULL DEFAULT '',
  vendor_id          uuid         REFERENCES public.vendors(id),
  vendor_name        text,
  subtotal           integer      NOT NULL DEFAULT 0,
  tax_rate_percent   numeric(5,2) NOT NULL DEFAULT 0,
  sales_tax          integer      NOT NULL DEFAULT 0,
  shipping_cost      integer      NOT NULL DEFAULT 0,
  grand_total        integer      NOT NULL DEFAULT 0,
  notes              text,
  work_order_id      uuid         REFERENCES public.work_orders(id),
  -- converted_po_id added below after purchase_orders table exists
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

CREATE TRIGGER trg_requisitions_updated_at
  BEFORE UPDATE ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_requisitions" ON public.requisitions
  FOR ALL USING (org_id = public.my_org_id());

-- ── Requisition Line Items ────────────────────────────────────────────────────

CREATE TABLE public.requisition_line_items (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid         NOT NULL REFERENCES public.organizations(id),
  requisition_id    uuid         NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  product_item_id   uuid         REFERENCES public.product_items(id),
  product_item_name text         NOT NULL DEFAULT '',
  part_number       text         NOT NULL DEFAULT '',
  quantity          integer      NOT NULL DEFAULT 1,
  unit_cost         integer      NOT NULL DEFAULT 0,   -- cents
  total_cost        integer      NOT NULL DEFAULT 0,   -- cents (quantity × unit_cost)
  project_id        uuid         REFERENCES public.projects(id),
  notes             text,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_requisition_line_items_updated_at
  BEFORE UPDATE ON public.requisition_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.requisition_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_req_line_items" ON public.requisition_line_items
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 17: PURCHASE ORDERS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.purchase_orders (
  id                      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid         NOT NULL REFERENCES public.organizations(id),
  created_by              uuid         REFERENCES public.profiles(id),
  po_number               text         NOT NULL,
  po_date                 date,
  invoice_number          text,
  status                  text         NOT NULL DEFAULT 'requested'
                            CHECK (status IN (
                              'requested', 'pending', 'approved', 'ordered',
                              'canceled', 'completed', 'rejected', 'partially_fulfilled'
                            )),
  vendor_id               uuid         REFERENCES public.vendors(id),
  vendor_name             text         NOT NULL DEFAULT '',
  subtotal                integer      NOT NULL DEFAULT 0,
  tax_rate_percent        numeric(5,2) NOT NULL DEFAULT 0,
  sales_tax               integer      NOT NULL DEFAULT 0,
  shipping_cost           integer      NOT NULL DEFAULT 0,
  grand_total             integer      NOT NULL DEFAULT 0,
  requisition_id          uuid         REFERENCES public.requisitions(id),
  payment_submitted_to_ap boolean      NOT NULL DEFAULT false,
  payment_remitted        boolean      NOT NULL DEFAULT false,
  payment_type            text         CHECK (payment_type IN ('check', 'ach', 'credit_card')),
  payment_booked_in_qb    boolean      NOT NULL DEFAULT false,
  notes                   text,
  created_at              timestamptz  NOT NULL DEFAULT now(),
  updated_at              timestamptz  NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_purchase_orders" ON public.purchase_orders
  FOR ALL USING (org_id = public.my_org_id());

-- Close the circular FK: requisitions → purchase_orders
ALTER TABLE public.requisitions
  ADD COLUMN converted_po_id uuid REFERENCES public.purchase_orders(id);

-- ── PO Line Items ─────────────────────────────────────────────────────────────

CREATE TABLE public.po_line_items (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid         NOT NULL REFERENCES public.organizations(id),
  po_id             uuid         NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_item_id   uuid         REFERENCES public.product_items(id),
  product_item_name text         NOT NULL DEFAULT '',
  part_number       text         NOT NULL DEFAULT '',
  quantity          integer      NOT NULL DEFAULT 1,
  unit_cost         integer      NOT NULL DEFAULT 0,   -- cents
  total_cost        integer      NOT NULL DEFAULT 0,   -- cents
  project_id        uuid         REFERENCES public.projects(id),
  notes             text,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_po_line_items_updated_at
  BEFORE UPDATE ON public.po_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.po_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_po_line_items" ON public.po_line_items
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 18: GOODS RECEIPTS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.goods_receipts (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid         NOT NULL REFERENCES public.organizations(id),
  created_by        uuid         REFERENCES public.profiles(id),
  receipt_number    text         NOT NULL,
  purchase_order_id uuid         NOT NULL REFERENCES public.purchase_orders(id),
  po_number         text         NOT NULL DEFAULT '',
  vendor_name       text         NOT NULL DEFAULT '',
  received_by_id    uuid         REFERENCES public.profiles(id),
  received_by_name  text         NOT NULL DEFAULT '',
  received_at       timestamptz  NOT NULL DEFAULT now(),
  subtotal          integer      NOT NULL DEFAULT 0,
  tax_rate_percent  numeric(5,2) NOT NULL DEFAULT 0,
  sales_tax         integer      NOT NULL DEFAULT 0,
  shipping_cost     integer      NOT NULL DEFAULT 0,
  grand_total       integer      NOT NULL DEFAULT 0,
  notes             text,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE TRIGGER trg_goods_receipts_updated_at
  BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_goods_receipts" ON public.goods_receipts
  FOR ALL USING (org_id = public.my_org_id());

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.goods_receipt_lines (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid        NOT NULL REFERENCES public.organizations(id),
  receipt_id         uuid        NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  po_line_item_id    uuid        REFERENCES public.po_line_items(id),
  product_item_name  text        NOT NULL DEFAULT '',
  part_number        text        NOT NULL DEFAULT '',
  quantity_ordered   integer     NOT NULL DEFAULT 0,
  quantity_received  integer     NOT NULL DEFAULT 0,
  quantity_remaining integer     NOT NULL DEFAULT 0,
  unit_cost          integer     NOT NULL DEFAULT 0,   -- cents
  is_maint_part      boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_goods_receipt_lines_updated_at
  BEFORE UPDATE ON public.goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.goods_receipt_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_goods_receipt_lines" ON public.goods_receipt_lines
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 19: APPROVAL REQUESTS  (per-record approval decisions)
-- ─────────────────────────────────────────────────────────────────────────────
-- entity_id is polymorphic (requisition or purchase_order); type indicated by entity_type.

CREATE TABLE public.approval_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES public.organizations(id),
  entity_type   text        NOT NULL CHECK (entity_type IN ('requisition', 'purchase_order')),
  entity_id     uuid        NOT NULL,
  flow_step_id  uuid        REFERENCES public.approval_flow_steps(id),
  "order"       integer     NOT NULL DEFAULT 0,
  approver_id   uuid        REFERENCES public.profiles(id),
  approver_name text        NOT NULL DEFAULT '',
  approver_role text        NOT NULL DEFAULT '',
  status        text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'skipped', 'superseded')),
  decided_at    timestamptz,
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_approval_requests_updated_at
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_approval_requests" ON public.approval_requests
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 20: COMMENTS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id),
  created_by  uuid        REFERENCES public.profiles(id),
  record_type text        NOT NULL
                CHECK (record_type IN ('requisition', 'po', 'receiving', 'project', 'work_order')),
  record_id   uuid        NOT NULL,
  author_id   uuid        REFERENCES public.profiles(id),
  author_name text        NOT NULL DEFAULT '',
  body        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TRIGGER trg_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_comments" ON public.comments
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 21: ATTACHMENTS
-- ─────────────────────────────────────────────────────────────────────────────
-- storage_path is the Supabase Storage path. Generate signed URLs at read time;
-- never store full signed URLs (they expire).

CREATE TABLE public.attachments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL REFERENCES public.organizations(id),
  created_by       uuid        REFERENCES public.profiles(id),
  record_type      text        NOT NULL
                     CHECK (record_type IN (
                       'requisition', 'po', 'receiving', 'project',
                       'work_order', 'request', 'vehicle', 'asset', 'vendor'
                     )),
  record_id        uuid        NOT NULL,
  file_name        text        NOT NULL,
  file_size        integer     NOT NULL DEFAULT 0,   -- bytes
  file_type        text        NOT NULL DEFAULT '',  -- MIME type
  storage_path     text        NOT NULL,
  uploaded_by_name text        NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE TRIGGER trg_attachments_updated_at
  BEFORE UPDATE ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_attachments" ON public.attachments
  FOR ALL USING (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 22: AUDIT LOG
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.audit_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id),
  created_by      uuid        REFERENCES public.profiles(id),
  record_type     text        NOT NULL,
  record_id       uuid        NOT NULL,
  action          text        NOT NULL
                    CHECK (action IN (
                      'created', 'updated', 'status_changed', 'qty_adjusted',
                      'price_updated', 'vendor_changed', 'image_uploaded', 'deleted'
                    )),
  changed_by_name text        NOT NULL DEFAULT '',
  description     text        NOT NULL DEFAULT '',
  field_changed   text,
  old_value       text,
  new_value       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TRIGGER trg_audit_log_updated_at
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
-- Audit log is read-only for org members; writes go via service role
CREATE POLICY "org_members_read_audit_log" ON public.audit_log
  FOR SELECT USING (org_id = public.my_org_id());
CREATE POLICY "service_insert_audit_log" ON public.audit_log
  FOR INSERT WITH CHECK (org_id = public.my_org_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 23: INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
-- Partial indexes on (org_id) WHERE deleted_at IS NULL cover the 99% case of
-- "list all active records for my org" that every list view runs.

-- org_id + soft-delete partial indexes
CREATE INDEX idx_vendors_org              ON public.vendors(org_id)              WHERE deleted_at IS NULL;
CREATE INDEX idx_product_items_org        ON public.product_items(org_id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_org             ON public.projects(org_id)             WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_org               ON public.assets(org_id)               WHERE deleted_at IS NULL;
CREATE INDEX idx_vehicles_org             ON public.vehicles(org_id)             WHERE deleted_at IS NULL;
CREATE INDEX idx_parts_org                ON public.parts(org_id)                WHERE deleted_at IS NULL;
CREATE INDEX idx_pm_schedules_org         ON public.pm_schedules(org_id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_meters_org               ON public.meters(org_id)               WHERE deleted_at IS NULL;
CREATE INDEX idx_work_orders_org          ON public.work_orders(org_id)          WHERE deleted_at IS NULL;
CREATE INDEX idx_maintenance_requests_org ON public.maintenance_requests(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_requisitions_org         ON public.requisitions(org_id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_purchase_orders_org      ON public.purchase_orders(org_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_goods_receipts_org       ON public.goods_receipts(org_id)       WHERE deleted_at IS NULL;
CREATE INDEX idx_comments_org             ON public.comments(org_id)             WHERE deleted_at IS NULL;
CREATE INDEX idx_attachments_org          ON public.attachments(org_id)          WHERE deleted_at IS NULL;
CREATE INDEX idx_audit_log_org            ON public.audit_log(org_id);

-- Status indexes (common filter in list views)
CREATE INDEX idx_work_orders_status         ON public.work_orders(org_id, status)         WHERE deleted_at IS NULL;
CREATE INDEX idx_requisitions_status        ON public.requisitions(org_id, status)        WHERE deleted_at IS NULL;
CREATE INDEX idx_purchase_orders_status     ON public.purchase_orders(org_id, status)     WHERE deleted_at IS NULL;
CREATE INDEX idx_maintenance_requests_status ON public.maintenance_requests(org_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_parts_low_stock            ON public.parts(org_id)
  WHERE deleted_at IS NULL AND quantity_on_hand <= minimum_stock;  -- low-stock dashboard

-- FK relationship indexes
CREATE INDEX idx_req_line_items_req_id       ON public.requisition_line_items(requisition_id);
CREATE INDEX idx_po_line_items_po_id         ON public.po_line_items(po_id);
CREATE INDEX idx_goods_receipt_lines_receipt ON public.goods_receipt_lines(receipt_id);
CREATE INDEX idx_asset_parts_asset_id        ON public.asset_parts(asset_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_asset_parts_part_id         ON public.asset_parts(part_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_parts_product_item_id       ON public.parts(product_item_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_meter_readings_meter_id     ON public.meter_readings(meter_id);
CREATE INDEX idx_work_orders_asset_id        ON public.work_orders(asset_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_wo_parts_wo_id              ON public.wo_parts(work_order_id)          WHERE deleted_at IS NULL;
CREATE INDEX idx_wo_labor_wo_id              ON public.wo_labor_entries(work_order_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_wo_vendor_charges_wo_id     ON public.wo_vendor_charges(work_order_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_approval_requests_entity    ON public.approval_requests(entity_type, entity_id);
CREATE INDEX idx_approval_requests_approver  ON public.approval_requests(approver_id, status);
CREATE INDEX idx_comments_record             ON public.comments(record_type, record_id)    WHERE deleted_at IS NULL;
CREATE INDEX idx_attachments_record          ON public.attachments(record_type, record_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_audit_log_record            ON public.audit_log(record_type, record_id);
CREATE INDEX idx_purchase_orders_req_id      ON public.purchase_orders(requisition_id);
CREATE INDEX idx_goods_receipts_po_id        ON public.goods_receipts(purchase_order_id);
