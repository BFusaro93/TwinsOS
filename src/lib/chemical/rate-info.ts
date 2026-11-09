import { concentrateUnitId, formatApplicationRateLabel } from "@/lib/chemical-mix-calc";
import type { ChemicalMixType } from "@/types/chemical-tracking";

/** What an application record snapshots from a product's rate when it is written. */
export interface ProductRateInfo {
  /** "2 Fluid Ounces per 1,000 Sq Ft" — null when the rate has no amount/area. */
  rateLabel: string | null;
  /** The unit the product itself (the concentrate) is measured in. */
  concentrateUnitId: string | null;
  applicationMethodId: string | null;
}

interface RateRow {
  product_id: string;
  is_default: boolean | null;
  created_at: string | null;
  application_method_id: string | null;
  rate_qty: number | string | null;
  unit_of_measure_id: string | null;
  area_qty: number | string | null;
  area_unit_id: string | null;
  mix_type: string | null;
  dilution_chemical_unit_id: string | null;
  mix_product_amount_unit_id: string | null;
}

const num = (v: number | string | null): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * Each product's default application rate (the first one when none is marked
 * default), as the rate label, concentrate unit and method an application row
 * snapshots. Server-side: pass the visit's org explicitly, since this is called
 * with the service role from the crew routes.
 */
export async function loadProductRateInfo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- called with both the typed user client and the untyped service client
  db: any,
  orgId: string,
  productIds: string[]
): Promise<Map<string, ProductRateInfo>> {
  const out = new Map<string, ProductRateInfo>();
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const { data: rates } = await db
    .from("crm_chemical_application_rates")
    .select(
      "product_id, is_default, created_at, application_method_id, rate_qty, unit_of_measure_id, area_qty, area_unit_id, mix_type, dilution_chemical_unit_id, mix_product_amount_unit_id"
    )
    .eq("org_id", orgId)
    .in("product_id", ids)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  const chosen = new Map<string, RateRow>();
  for (const r of (rates ?? []) as RateRow[]) if (!chosen.has(r.product_id)) chosen.set(r.product_id, r);
  if (chosen.size === 0) return out;

  const unitIds = [...new Set([...chosen.values()].flatMap((r) => [r.unit_of_measure_id, r.area_unit_id]).filter(Boolean))] as string[];
  const { data: units } = unitIds.length
    ? await db.from("crm_chemical_lookup_items").select("id, name").eq("org_id", orgId).in("id", unitIds)
    : { data: [] };
  const nameById = new Map<string, string>(((units ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]));

  for (const [productId, r] of chosen) {
    const rate = {
      rateQty: num(r.rate_qty),
      unitOfMeasureId: r.unit_of_measure_id,
      areaQty: num(r.area_qty),
      areaUnitId: r.area_unit_id,
      mixType: (r.mix_type ?? "none") as ChemicalMixType,
      dilutionChemicalUnitId: r.dilution_chemical_unit_id,
      mixProductAmountUnitId: r.mix_product_amount_unit_id,
    };
    out.set(productId, {
      rateLabel: formatApplicationRateLabel(rate, (id) => nameById.get(id)),
      concentrateUnitId: concentrateUnitId(rate),
      applicationMethodId: r.application_method_id,
    });
  }
  return out;
}
