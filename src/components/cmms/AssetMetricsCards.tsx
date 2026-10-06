"use client";

import { useState } from "react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { useAssetMetrics } from "@/lib/hooks/use-asset-metrics";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import { summarizePMCompliance } from "@/lib/utils/pm-compliance";
import { formatWarrantyCountdown, getWarrantyStatus } from "@/lib/utils/warranty";

const WINDOWS: { value: number; label: string }[] = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "12 months" },
];

type Tone = "neutral" | "good" | "warn" | "bad";

const TONE_VALUE: Record<Tone, string> = {
  neutral: "text-slate-900 dark:text-neutral-100",
  good: "text-green-700 dark:text-green-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

function MetricCard({ label, value, sub, tone = "neutral", title }: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm" title={title}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">{label}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", TONE_VALUE[tone])}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function pctTone(pct: number | null, good: number, warn: number): Tone {
  if (pct === null) return "neutral";
  if (pct >= good) return "good";
  if (pct >= warn) return "warn";
  return "bad";
}

function hours(h: number): string {
  return h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} h`;
}

interface AssetMetricsCardsProps {
  assetId: string;
  /** From the record rather than the metrics row, so an edit shows immediately. */
  warrantyEndDate: string | null;
  purchasePrice: number | null;
}

/** Reliability and cost at a glance, for the top of an asset or vehicle's Details tab. */
export function AssetMetricsCards({ assetId, warrantyEndDate, purchasePrice }: AssetMetricsCardsProps) {
  const [windowDays, setWindowDays] = useState<number>(90);
  const { data, isLoading, isError } = useAssetMetrics(windowDays, assetId);
  const { today } = useOrgDates();
  const m = data?.[0];

  const windowLabel = WINDOWS.find((w) => w.value === windowDays)?.label ?? `${windowDays} days`;
  const warranty = getWarrantyStatus(warrantyEndDate, today());

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">Performance</p>
        <SegmentedControl
          ariaLabel="Reliability window"
          size="sm"
          options={WINDOWS}
          value={windowDays}
          onChange={setWindowDays}
        />
      </div>

      {isError ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-slate-400 dark:text-neutral-500">
          Performance figures couldn&apos;t be loaded.
        </p>
      ) : isLoading || !m ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[84px] animate-pulse rounded-lg border bg-muted" />
          ))}
        </div>
      ) : (
        <MetricsGrid m={m} windowLabel={windowLabel} warranty={warranty} warrantyEndDate={warrantyEndDate} purchasePrice={purchasePrice} />
      )}
    </div>
  );
}

function MetricsGrid({ m, windowLabel, warranty, warrantyEndDate, purchasePrice }: {
  m: NonNullable<ReturnType<typeof useAssetMetrics>["data"]>[number];
  windowLabel: string;
  warranty: ReturnType<typeof getWarrantyStatus>;
  warrantyEndDate: string | null;
  purchasePrice: number | null;
}) {
  const pm = summarizePMCompliance({
    onTime: m.pmOnTime,
    late: m.pmLate,
    completed: m.pmCompleted - m.pmOnTime - m.pmLate,
    skipped: m.pmSkipped,
    overdue: m.pmOverdue,
    notGenerated: m.pmNotGenerated,
  });
  const repair12 = m.cost12moCents - m.pmCost12moCents;
  const pctOfPrice = purchasePrice && purchasePrice > 0
    ? Math.round((100 * m.costLifetimeCents) / purchasePrice)
    : null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <MetricCard
        label={`Uptime · ${windowLabel}`}
        value={m.uptimePct === null ? "—" : `${m.uptimePct}%`}
        tone={m.downSince ? "bad" : pctTone(m.uptimePct, 97, 90)}
        title="Time active ÷ time in service. Inactive (parked) and disposed time isn't counted either way."
        sub={
          m.downSince
            ? <span className="font-medium text-red-600 dark:text-red-400">Down since {formatDate(m.downSince)}</span>
            : m.uptimePct === null
              ? "No in-service time in this window"
              : `${hours(m.downtimeHours)} down · ${m.downtimeEvents} event${m.downtimeEvents === 1 ? "" : "s"}`
        }
      />
      <MetricCard
        label="Maint. cost · 12 mo"
        value={formatCurrency(m.cost12moCents)}
        title="Parts, labor and vendor charges on this record's work orders, dated by completion."
        sub={`PM ${formatCurrency(m.pmCost12moCents)} · Repair ${formatCurrency(repair12)}`}
      />
      <MetricCard
        label="Maint. cost · lifetime"
        value={formatCurrency(m.costLifetimeCents)}
        tone={pctOfPrice !== null && pctOfPrice >= 50 ? "warn" : "neutral"}
        title="All-time work order cost. Compared with the purchase price as a repair-vs-replace signal."
        sub={pctOfPrice !== null ? `${pctOfPrice}% of purchase price` : "No purchase price on file"}
      />
      <MetricCard
        label={`PM compliance · ${windowLabel}`}
        value={pm.compliancePct === null ? "—" : `${pm.compliancePct}%`}
        tone={pctTone(pm.compliancePct, 95, 80)}
        title="Scheduled and meter-triggered PMs completed ÷ PMs that came due. Skipped, overdue and never-generated PMs count as missed."
        sub={
          pm.due === 0
            ? "No scheduled PMs came due"
            : `${pm.done} of ${pm.due} done${pm.onTimePct !== null ? ` · ${pm.onTimePct}% on time` : ""}`
        }
      />
      <MetricCard
        label={`Avg repair time · ${windowLabel}`}
        value={m.mttrHours === null ? "—" : hours(m.mttrHours)}
        title="Mean time to repair: the average length of an in-shop / out-of-service period that started and ended in this window."
        sub={`${m.woCount} work order${m.woCount === 1 ? "" : "s"} · ${m.openWoCount} open`}
      />
      <MetricCard
        label="Warranty"
        value={
          warranty.state === "none" ? "None on file" :
          warranty.state === "expired" ? "Expired" :
          warranty.state === "expiring" ? "Expiring soon" : "Active"
        }
        tone={
          warranty.state === "active" ? "good" :
          warranty.state === "expiring" ? "warn" :
          warranty.state === "expired" ? "bad" : "neutral"
        }
        sub={
          warranty.daysLeft !== null && warrantyEndDate
            ? `${formatWarrantyCountdown(warranty.daysLeft)} · ${formatDate(warrantyEndDate)}`
            : "Add one from Edit"
        }
      />
    </div>
  );
}
