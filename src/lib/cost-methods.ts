/**
 * Inventory costing methods for pre-filling unit costs on Requisitions, POs, and Work Orders.
 *
 * Three modes:
 *  - manual  : Use the unit cost set directly on the catalog record (no automatic update).
 *  - wac     : Weighted Average Cost — recalculated after every goods receipt.
 *  - fifo    : First-In First-Out — oldest available cost layer is used next.
 *
 * Historical PO/WO line items are NEVER touched; cost layers only influence
 * the pre-fill value when a new line item is being created.
 */

export type CostMethod = "manual" | "wac" | "fifo";

export const COST_METHOD_LABELS: Record<CostMethod, string> = {
  manual: "Manual",
  wac: "Weighted Average Cost (WAC)",
  fifo: "First In, First Out (FIFO)",
};

/** A single inventory receipt batch that contributes to FIFO/WAC calculations. */
export interface CostLayer {
  id: string;
  /** Remaining units in this layer (decremented as stock is consumed). */
  quantity: number;
  /** Unit cost in cents at time of receipt. */
  unitCost: number;
  receivedAt: string; // ISO date-time
  /** Reference PO number, for traceability. */
  poNumber?: string;
}

// ── Computations ──────────────────────────────────────────────────────────────

/** Weighted Average Cost across all layers with remaining quantity. */
export function computeWAC(layers: CostLayer[], fallback: number): number {
  const live = layers.filter((l) => l.quantity > 0);
  const totalQty = live.reduce((s, l) => s + l.quantity, 0);
  if (totalQty <= 0) return fallback;
  const totalValue = live.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  return Math.round(totalValue / totalQty);
}

/** FIFO cost: the unit cost of the oldest layer that still has remaining quantity. */
export function computeFIFO(layers: CostLayer[], fallback: number): number {
  const sorted = [...layers]
    .filter((l) => l.quantity > 0)
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  return sorted[0]?.unitCost ?? fallback;
}

/**
 * Returns the appropriate unit cost (cents) to pre-fill a new line item,
 * based on the active cost method.
 */
export function getCatalogCost(
  unitCost: number,
  costLayers: CostLayer[] | undefined,
  method: CostMethod
): number {
  if (!costLayers || costLayers.length === 0 || method === "manual") return unitCost;
  if (method === "wac") return computeWAC(costLayers, unitCost);
  if (method === "fifo") return computeFIFO(costLayers, unitCost);
  return unitCost;
}

// ── Mutation helpers ──────────────────────────────────────────────────────────

/**
 * Appends a new receipt layer to an existing layers array.
 * Returns a new array (immutable).
 */
export function addCostLayer(
  existing: CostLayer[],
  receipt: { quantity: number; unitCost: number; receivedAt: string; poNumber?: string }
): CostLayer[] {
  const id = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return [...existing, { id, ...receipt }];
}

/**
 * After adding a receipt layer, determine the unit_cost value to store back on
 * the catalog record.
 *
 * The stored unit_cost serves two purposes:
 *   1. Display — what the Products page shows as the current price.
 *   2. Pre-fill for manual mode — what getCatalogCost() returns when method === "manual".
 *
 * Rules:
 *   - WAC  → store the weighted average across all live layers.
 *   - FIFO → store the most recently received price (display only; pre-fill is
 *             computed dynamically from layers by getCatalogCost).
 *   - manual → store the most recently received price so the catalog always
 *               reflects the last price paid (users can still override manually).
 */
export function computeNewUnitCost(
  layers: CostLayer[],
  method: CostMethod,
  currentUnitCost: number
): number {
  if (method === "wac") return computeWAC(layers, currentUnitCost);
  // manual / fifo: update to the last received price so the catalog stays current.
  const lastLayer = layers[layers.length - 1];
  return lastLayer?.unitCost ?? currentUnitCost;
}
