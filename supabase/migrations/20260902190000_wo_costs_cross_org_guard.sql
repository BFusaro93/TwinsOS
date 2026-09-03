-- Defense-in-depth for two Work Order Costs tab bugs:
--
-- 1. Cross-org FK injection: the RLS policies on wo_vendor_charges and
--    wo_parts (see 20260325000000_initial_schema.sql) only check that the
--    row's own org_id matches the caller's org — they never verify that
--    vendor_id/part_id actually resolves to a vendor/part belonging to that
--    same org. A client could insert a row with its own org_id but a
--    vendor_id/part_id pointing at another org's vendor/part. The app-layer
--    fix lives in src/lib/hooks/use-wo-costs.ts (fetches the referenced
--    vendor/part and checks org_id before inserting/updating); this trigger
--    is the DB-level backstop in case that check is ever bypassed.
--
-- 2. Missing non-negative validation on hours/rate/cost/quantity/unit_cost —
--    the app-layer fix lives in src/components/cmms/WOCostsTab.tsx; these
--    CHECK constraints are the DB-level backstop.

-- ── Cross-org FK guard ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wo_parts_check_cross_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_part_org_id uuid;
BEGIN
  IF NEW.part_id IS NOT NULL THEN
    SELECT org_id INTO v_part_org_id FROM public.parts WHERE id = NEW.part_id;
    IF v_part_org_id IS NULL THEN
      RAISE EXCEPTION 'Part % not found', NEW.part_id;
    END IF;
    IF v_part_org_id != NEW.org_id THEN
      RAISE EXCEPTION 'Part % does not belong to this organization', NEW.part_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wo_parts_check_cross_org ON public.wo_parts;
CREATE TRIGGER trg_wo_parts_check_cross_org
  BEFORE INSERT OR UPDATE ON public.wo_parts
  FOR EACH ROW EXECUTE FUNCTION public.wo_parts_check_cross_org();

CREATE OR REPLACE FUNCTION public.wo_vendor_charges_check_cross_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_org_id uuid;
BEGIN
  IF NEW.vendor_id IS NOT NULL THEN
    SELECT org_id INTO v_vendor_org_id FROM public.vendors WHERE id = NEW.vendor_id;
    IF v_vendor_org_id IS NULL THEN
      RAISE EXCEPTION 'Vendor % not found', NEW.vendor_id;
    END IF;
    IF v_vendor_org_id != NEW.org_id THEN
      RAISE EXCEPTION 'Vendor % does not belong to this organization', NEW.vendor_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wo_vendor_charges_check_cross_org ON public.wo_vendor_charges;
CREATE TRIGGER trg_wo_vendor_charges_check_cross_org
  BEFORE INSERT OR UPDATE ON public.wo_vendor_charges
  FOR EACH ROW EXECUTE FUNCTION public.wo_vendor_charges_check_cross_org();

-- ── Non-negative CHECK constraints ───────────────────────────────────────────

ALTER TABLE public.wo_labor_entries
  ADD CONSTRAINT wo_labor_entries_hours_non_negative CHECK (hours >= 0),
  ADD CONSTRAINT wo_labor_entries_hourly_rate_non_negative CHECK (hourly_rate >= 0);

ALTER TABLE public.wo_parts
  ADD CONSTRAINT wo_parts_quantity_non_negative CHECK (quantity >= 0),
  ADD CONSTRAINT wo_parts_unit_cost_non_negative CHECK (unit_cost >= 0);

ALTER TABLE public.wo_vendor_charges
  ADD CONSTRAINT wo_vendor_charges_cost_non_negative CHECK (cost >= 0);
