import { applyMatrixTail, lookupRateMatrixMatch, type MatrixTailRule, type RateMatrixRow } from "@/lib/hooks/use-rate-matrix";
import { isAreaUnit } from "@/lib/estimates/units";

/** A service's rate matrix is keyed off the estimate line's own quantity when its rows carry no property field. */
export function isQtyKeyedMatrix(rows: readonly Pick<RateMatrixRow, "customFieldId">[]): boolean {
  return rows.length > 0 && rows[0].customFieldId == null;
}

export interface QtyMatrixLinePatch {
  calcType: 0 | 1;
  rateCents: number;
  costCents: number;
  budgetedHours: number;
  budgetMethod: "manual" | "production_rate";
  /** Set only when the band is a per-unit row on an area line (hours re-derive from qty). */
  productionRateSqftPerHr: number | null;
}

/**
 * Prices a line off a quantity-keyed rate matrix: the band holding `qty`
 * (past the last band, the service's "every X over Y" rule) sets the line's
 * calc type, rate, cost and hours. Returns null when the matrix has nothing to
 * say about this quantity (below the lowest band), so the caller keeps the
 * line as it is. Mirrors the add-time logic for property-keyed matrices.
 */
export function qtyMatrixLinePatch(
  rows: RateMatrixRow[],
  tail: MatrixTailRule | null,
  qty: number,
  unit: string | null | undefined,
): QtyMatrixLinePatch | null {
  if (!isQtyKeyedMatrix(rows) || !(qty > 0)) return null;
  let match = lookupRateMatrixMatch(rows, qty);
  if ((!match || match.isTailRow) && tail) match = applyMatrixTail(rows, qty, tail) ?? match;
  if (!match) return null;
  // A per-unit band on an area line is a production rate the other way up.
  if (match.calcType === 1 && match.budgetedHours > 0 && isAreaUnit(unit)) {
    return {
      calcType: 1,
      rateCents: match.rateCents,
      costCents: match.budgetedCostCents,
      budgetedHours: 0,
      budgetMethod: "production_rate",
      productionRateSqftPerHr: 1 / match.budgetedHours,
    };
  }
  return {
    calcType: match.calcType,
    rateCents: match.rateCents,
    costCents: match.budgetedCostCents,
    budgetedHours: match.calcType === 1 ? match.budgetedHours * qty : match.budgetedHours,
    budgetMethod: "manual",
    productionRateSqftPerHr: null,
  };
}
