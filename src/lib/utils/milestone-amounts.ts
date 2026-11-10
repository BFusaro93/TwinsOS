/**
 * Percent-milestone amounts, resolved the way the database bills them
 * (_milestone_percent_amount_cents, 20261230000400):
 *
 *  - every percent row belongs to a BASIS GROUP (the project contract, an
 *    add-on estimate's own total, or the estimate total off a project);
 *  - each row is round(basis × percent);
 *  - except the LAST pending percent row of a group (schedule order), which
 *    takes the rounding remainder so the group adds up to exactly
 *    round(basis × its total percent). 50/50 of $12,345.67 is $6,172.84 +
 *    $6,172.83, never $6,172.84 twice.
 *
 * Percent values are basis points (1% = 100).
 */

export interface PercentMilestoneLike {
  id: string;
  milestoneType: "flat" | "percent";
  milestoneValue: number;
  status: string;
  sortOrder: number;
  createdAt?: string;
}

export interface MilestoneBasis {
  /** Rows with the same key share a basis and a rounding remainder. */
  key: string;
  basisCents: number;
}

/** Plain code-unit comparison (matches the database's uuid / ISO-timestamp ordering). */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Map of milestone id → amount (cents) for every percent row with a positive basis. */
export function resolvePercentMilestoneAmounts<T extends PercentMilestoneLike>(
  rows: T[],
  basisOf: (row: T) => MilestoneBasis | null,
): Map<string, number> {
  const out = new Map<string, number>();
  const groups = new Map<string, { basisCents: number; rows: T[] }>();
  for (const r of rows) {
    if (r.milestoneType !== "percent") continue;
    const b = basisOf(r);
    if (!b || b.basisCents <= 0) continue;
    const g = groups.get(b.key) ?? { basisCents: b.basisCents, rows: [] };
    g.rows.push(r);
    groups.set(b.key, g);
  }
  for (const { basisCents, rows: groupRows } of groups.values()) {
    for (const r of groupRows) out.set(r.id, Math.round((basisCents * r.milestoneValue) / 10000));
    const last = groupRows
      .filter((r) => r.status === "pending")
      .sort((a, b) => b.sortOrder - a.sortOrder || cmp(b.createdAt ?? "", a.createdAt ?? "") || cmp(b.id, a.id))[0];
    if (!last || last.milestoneValue <= 0) continue;
    const totalBps = groupRows.reduce((s, r) => s + r.milestoneValue, 0);
    const others = groupRows.filter((r) => r.id !== last.id).reduce((s, r) => s + (out.get(r.id) ?? 0), 0);
    out.set(last.id, Math.max(0, Math.round((basisCents * totalBps) / 10000) - others));
  }
  return out;
}
