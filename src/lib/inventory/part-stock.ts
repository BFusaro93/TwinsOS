import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>;

export interface PartStockResult {
  /** Quantity on hand before the change (null when nothing moved). */
  oldQty: number | null;
  /** Stock delta asked for (negative = out, positive = back in). */
  requestedDelta: number;
  /** Stock delta actually applied — a deduction clamps at 0 on hand. */
  appliedDelta: number;
}

/**
 * Makes a wo_parts line's deduction from parts inventory equal `target` units
 * (its quantity, or 0 when the line / its work order is removed). Only what
 * was really deducted is ever credited back, because deductions clamp at 0
 * on hand (see 20260926170000_wo_parts_quantity_deducted.sql).
 */
export async function setWOPartStock(
  supabase: AnySupabase,
  woPartId: string,
  target: number
): Promise<PartStockResult> {
  const { data, error } = await supabase
    .rpc("set_wo_part_stock", { p_wo_part_id: woPartId, p_target: Math.max(0, Math.round(target)) })
    .single();
  if (error) throw error;
  const row = data as { old_qty: number | null; requested_delta: number; applied_delta: number } | null;
  return {
    oldQty: row?.old_qty ?? null,
    requestedDelta: row?.requested_delta ?? 0,
    appliedDelta: row?.applied_delta ?? 0,
  };
}

/**
 * Corrects a part's stock for a goods-receipt change (receipt quantity edit,
 * PO line delete, or rolling back a failed receipt). Moves cost_layers with
 * the quantity and, for a reduction, removes only what is still on hand
 * instead of failing when some units were already used (see
 * 20260926170100_correct_part_receipt.sql).
 */
export async function correctPartReceipt(
  supabase: AnySupabase,
  input: { orgId: string; partId: string; delta: number; unitCost: number; poNumber: string | null }
): Promise<PartStockResult> {
  const { data, error } = await supabase
    .rpc("correct_part_receipt", {
      p_org_id: input.orgId,
      p_part_id: input.partId,
      p_delta: Math.round(input.delta),
      p_unit_cost: Math.round(input.unitCost),
      p_po_number: input.poNumber ?? "",
    })
    .single();
  if (error) throw error;
  const row = data as { old_qty: number | null; requested_delta: number; applied_delta: number } | null;
  return {
    oldQty: row?.old_qty ?? null,
    requestedDelta: row?.requested_delta ?? Math.round(input.delta),
    appliedDelta: row?.applied_delta ?? 0,
  };
}

/**
 * adjust_product_item_quantity raises rather than go negative. For a
 * reduction, clamp to what the product still has on hand so a reversal of
 * already-used stock removes what remains instead of blocking the change.
 * Returns the delta to apply (<= 0 when `delta` < 0).
 */
export async function clampProductReduction(
  supabase: AnySupabase,
  productId: string,
  delta: number
): Promise<number> {
  if (delta >= 0) return delta;
  const { data } = await supabase
    .from("product_items")
    .select("quantity_on_hand")
    .eq("id", productId)
    .maybeSingle();
  const onHand = Math.max(0, Number((data as { quantity_on_hand: number | null } | null)?.quantity_on_hand ?? 0));
  return -Math.min(-delta, onHand);
}

/** User-facing note for a clamped reduction, or null when fully applied. */
export function shortfallMessage(name: string, result: PartStockResult): string | null {
  if (result.requestedDelta >= 0 || result.appliedDelta <= result.requestedDelta) return null;
  const short = result.appliedDelta - result.requestedDelta;
  return `${name}: only ${Math.abs(result.appliedDelta)} of ${Math.abs(result.requestedDelta)} could be removed from stock — ${short} had already been used. Quantity on hand is now 0.`;
}
