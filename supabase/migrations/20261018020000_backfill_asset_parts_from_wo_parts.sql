-- Backfill asset_parts from parts already used on Work Orders.
--
-- linkPartToAssetFromWO (use-wo-costs.ts, 2026-08-18) auto-links a part to the
-- WO's asset/vehicle at add time, but only going forward. Parts added to WOs
-- before that date were never linked. This applies the same rule retroactively:
-- every live wo_parts row on a live, asset-linked WO gets an asset_parts link.
--
-- Differences from the live code, deliberate:
--   * An existing asset_parts row (even soft-deleted) is left alone. A
--     soft-deleted link means someone removed it on purpose; the live code
--     restores it only because the user is re-adding the part right then.
--   * Org-mismatched WO/part pairs and soft-deleted parts are skipped.
-- asset_parts.asset_id is polymorphic (assets + vehicles), same as the live code.
-- Idempotent: re-running inserts nothing new.

INSERT INTO public.asset_parts (org_id, asset_id, part_id, part_name, part_number)
SELECT DISTINCT ON (wo.asset_id, wp.part_id)
  wo.org_id, wo.asset_id, wp.part_id, p.name, p.part_number
FROM public.wo_parts wp
JOIN public.work_orders wo ON wo.id = wp.work_order_id
JOIN public.parts p ON p.id = wp.part_id
  AND p.org_id = wo.org_id
  AND p.deleted_at IS NULL
WHERE wp.deleted_at IS NULL
  AND wo.deleted_at IS NULL
  AND wo.asset_id IS NOT NULL
  AND wp.part_id IS NOT NULL
ORDER BY wo.asset_id, wp.part_id, wp.created_at
ON CONFLICT (asset_id, part_id) DO NOTHING;
