/**
 * Shared in-memory stores for Parts and Products.
 *
 * Owned here — not in use-parts.ts or use-products.ts — so both hook files
 * can cross-reference each other's data without circular imports.
 *
 * Access via getter/setter functions (not exported `let` bindings, which would
 * give importers a stale copy after reassignment).
 */
import type { Part, ProductItem } from "@/types";

// Start empty — seeded by useParts() and useProducts() after their first successful fetch.
let _parts: Part[] = [];
let _products: ProductItem[] = [];

// ── Parts store ───────────────────────────────────────────────────────────────

export function getParts(): Part[] {
  return _parts;
}

export function setParts(store: Part[]): void {
  _parts = store;
}

// ── Products store ────────────────────────────────────────────────────────────

export function getProducts(): ProductItem[] {
  return _products;
}

export function setProducts(store: ProductItem[]): void {
  _products = store;
}

// ── Cross-record unit-cost sync ───────────────────────────────────────────────

const ts = () => new Date().toISOString();

/**
 * Called by useBulkUpdateParts after updating a part's unitCost.
 * Mirrors the new cost to the linked ProductItem (category: maintenance_part).
 * NOT called during goods receipt — ReceiveGoodsDialog updates both sides
 * explicitly via separate mutations.
 */
export function mirrorPartCostToProduct(partId: string, unitCost: number): void {
  const part = _parts.find((p) => p.id === partId);
  if (!part?.productItemId) return;
  const productItemId = part.productItemId;
  const now = ts();
  _products = _products.map((p) =>
    p.id === productItemId ? { ...p, unitCost, updatedAt: now } : p
  );
}

/**
 * Called by useBulkUpdateProducts after updating a product's unitCost.
 * Mirrors the new cost to the linked Part (if one exists with productItemId === productId).
 * NOT called during goods receipt.
 */
export function mirrorProductCostToPart(productId: string, unitCost: number): void {
  const now = ts();
  _parts = _parts.map((p) =>
    p.productItemId === productId ? { ...p, unitCost, updatedAt: now } : p
  );
}
