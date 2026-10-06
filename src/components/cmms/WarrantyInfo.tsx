"use client";

import { cn, formatDate } from "@/lib/utils";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import {
  formatWarrantyCountdown,
  formatWarrantyTerm,
  getWarrantyStatus,
  type WarrantyRecordFields,
} from "@/lib/utils/warranty";

const STATE_CLASS = {
  active: "text-green-700 dark:text-green-400",
  expiring: "text-amber-600 dark:text-amber-400",
  expired: "text-red-600 dark:text-red-400",
  none: "text-muted-foreground",
} as const;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-slate-900 dark:text-neutral-100">{value ?? "—"}</dd>
    </div>
  );
}

/** Warranty section of the asset and vehicle Details tabs. */
export function WarrantyInfo({ record }: { record: WarrantyRecordFields }) {
  const { today } = useOrgDates();
  const status = getWarrantyStatus(record.warrantyEndDate, today());

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">Warranty</p>
      <dl>
        <Row
          label="Coverage Ends"
          value={
            record.warrantyEndDate ? (
              <span>
                {formatDate(record.warrantyEndDate)}
                {status.daysLeft !== null && (
                  <span className={cn("ml-1.5 text-xs font-medium", STATE_CLASS[status.state])}>
                    {formatWarrantyCountdown(status.daysLeft)}
                  </span>
                )}
              </span>
            ) : null
          }
        />
        <Row label="Coverage Starts" value={record.warrantyStartDate ? formatDate(record.warrantyStartDate) : null} />
        {record.warrantyTermMonths && (
          <Row label="Coverage Period" value={formatWarrantyTerm(record.warrantyTermMonths)} />
        )}
        <Row label="Warranty Notes" value={record.warrantyNotes} />
      </dl>
    </div>
  );
}
