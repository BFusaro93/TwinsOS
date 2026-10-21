import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatWarrantyCountdown, getWarrantyStatus } from "@/lib/utils/warranty";
import type { CRMWarranty } from "@/types/crm-warranties";

const STYLE = {
  pending: "border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-muted/40 text-slate-600 dark:text-neutral-400",
  void: "border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-muted/40 text-slate-500 dark:text-neutral-500 line-through",
  active: "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400",
  expiring: "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
  expired: "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
};

export type WarrantyDisplayState = keyof typeof STYLE;

export function warrantyDisplayState(w: CRMWarranty, today: string): { state: WarrantyDisplayState; daysLeft: number | null } {
  if (w.status === "pending") return { state: "pending", daysLeft: null };
  if (w.status === "void") return { state: "void", daysLeft: null };
  const s = getWarrantyStatus(w.endDate, today);
  return { state: s.state === "none" ? "active" : s.state, daysLeft: s.daysLeft };
}

const LABEL: Record<WarrantyDisplayState, string> = {
  pending: "Not started",
  void: "Void",
  active: "Active",
  expiring: "Expiring soon",
  expired: "Expired",
};

export function WarrantyStatusBadge({ warranty, today }: { warranty: CRMWarranty; today: string }) {
  const { state, daysLeft } = warrantyDisplayState(warranty, today);
  return (
    <Badge
      variant="outline"
      className={cn("border text-xs font-medium", STYLE[state])}
      title={daysLeft != null ? formatWarrantyCountdown(daysLeft) : undefined}
    >
      {LABEL[state]}
    </Badge>
  );
}
