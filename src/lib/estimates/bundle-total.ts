import type { EstimateTemplateItem } from "@/types/crm-estimates";

/** What a bundle adds to an estimate: each line (net of its own discount) plus its sub-items. */
export function bundleTotalCents(items: EstimateTemplateItem[]): number {
  return items.reduce((sum, item) => {
    const line = Math.max(0, Math.round(item.qty * item.rateCents * item.visits) - (item.discountCents ?? 0));
    const subs = (item.subitems ?? []).reduce((s, sub) => s + Math.round(sub.qty * sub.rateCents), 0);
    return sum + line + subs;
  }, 0);
}
