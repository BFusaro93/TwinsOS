import type { CommissionEarnedOn, CommissionSaleType } from "@/types/crm-commissions";

export const SALE_TYPE_LABEL: Record<CommissionSaleType, string> = { any: "New & renewal", new: "New sales", renewal: "Renewals / accounts" };
export const EARNED_ON_LABEL: Record<CommissionEarnedOn, string> = { paid: "When paid", invoiced: "When invoiced" };

/** 250 bps -> "2.5%" */
export function formatRate(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

/** Calendar-quarter bounds ("YYYY-MM-DD") for the quarter containing `ymd`, shifted by `offset` quarters. */
export function quarterBounds(ymd: string, offset = 0): { from: string; to: string } {
  const [y, m] = ymd.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + offset;
  const year = y + Math.floor(q / 4);
  const qi = ((q % 4) + 4) % 4;
  const start = new Date(Date.UTC(year, qi * 3, 1));
  const end = new Date(Date.UTC(year, qi * 3 + 3, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function yearBounds(ymd: string): { from: string; to: string } {
  const y = ymd.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}
