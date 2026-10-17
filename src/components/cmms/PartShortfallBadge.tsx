"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { WOPartShortfall } from "@/lib/hooks/use-wo-part-shortfalls";

export function shortfallUnits(rows: WOPartShortfall[] | undefined): number {
  return (rows ?? []).reduce((sum, r) => sum + r.shortQty, 0);
}

/** Compact "used before received" flag for lists and headers. */
export function PartShortfallBadge({ rows }: { rows: WOPartShortfall[] | undefined }) {
  const units = shortfallUnits(rows);
  if (units <= 0) return null;
  return (
    <Badge
      variant="outline"
      title="Used on work orders before enough stock was received. This clears when the part is received."
      className="shrink-0 gap-1 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
    >
      <AlertTriangle className="h-3 w-3" />
      {units} used before received
    </Badge>
  );
}

/** Explains the badge on the part sheet: which work orders took stock that wasn't there. */
export function PartShortfallNotice({ rows }: { rows: WOPartShortfall[] | undefined }) {
  if (!rows?.length) return null;
  return (
    <div className="mx-6 mt-4 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-300">
      <p className="font-medium">
        {shortfallUnits(rows)} unit{shortfallUnits(rows) === 1 ? "" : "s"} used before being received
      </p>
      <p className="mt-0.5 text-xs">
        On hand was too low when these work orders took the part. The units come off the next receipt
        automatically.
      </p>
      <ul className="mt-2 space-y-0.5 text-xs">
        {rows.map((r) => (
          <li key={r.woPartId}>
            <span className="font-mono">{r.workOrderNumber}</span>
            {r.workOrderTitle ? ` — ${r.workOrderTitle}` : ""}: {r.shortQty} of {r.quantity} short
          </li>
        ))}
      </ul>
    </div>
  );
}
