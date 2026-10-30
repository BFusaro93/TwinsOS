import type { CRMJobServiceSubitem } from "@/types/crm-jobs";

/** Live sub-items of a job service, in display order. Tolerates a missing/null embed. */
export function mapServiceSubitems(raw: unknown): CRMJobServiceSubitem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[])
    .filter((r) => !r.deleted_at)
    .map((r) => ({
      id: r.id as string,
      type: (r.type === "subservice" ? "subservice" : "product") as "product" | "subservice",
      name: r.name as string,
      qty: Number(r.qty ?? 1),
      sortOrder: (r.sort_order as number) ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
