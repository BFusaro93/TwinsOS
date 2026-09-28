"use client";

import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportSkeletonCard, ReportStatCard } from "@/components/shared/ReportStatCard";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAssetMetrics } from "@/lib/hooks/use-asset-metrics";
import { useOpenAssetRecord } from "@/lib/hooks/use-open-asset-record";
import { ASSET_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";

const WINDOWS = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "6 months" },
  { value: 365, label: "12 months" },
];

type Kind = "all" | "asset" | "vehicle";
const KINDS: { value: Kind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "vehicle", label: "Vehicles" },
  { value: "asset", label: "Equipment" },
];

function uptimeClass(v: number | null): string {
  if (v === null) return "text-slate-400";
  if (v >= 97) return "text-green-700";
  if (v >= 90) return "text-amber-600";
  return "text-red-600";
}

function hours(h: number): string {
  return h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`;
}

export function UptimeReport() {
  const [windowDays, setWindowDays] = useState(90);
  const [kind, setKind] = useState<Kind>("all");
  const [showAll, setShowAll] = useState(false);
  const { data = [], isLoading, isError } = useAssetMetrics(windowDays);
  const openRecord = useOpenAssetRecord();

  const ofKind = useMemo(() => data.filter((m) => kind === "all" || m.entityType === kind), [data, kind]);
  // Only units that were in service at some point in the window have an
  // uptime. (Not inServiceHours > 0: that's rounded, so a unit added minutes
  // ago reads 0.0 h.)
  const rows = useMemo(() => ofKind.filter((m) => m.uptimePct !== null), [ofKind]);

  const fleet = useMemo(() => {
    const inService = rows.reduce((s, m) => s + m.inServiceHours, 0);
    const down = rows.reduce((s, m) => s + m.downtimeHours, 0);
    const events = rows.reduce((s, m) => s + m.downtimeEvents, 0);
    const withMttr = rows.filter((m) => m.mttrHours !== null);
    // Weight each unit's MTTR by how many repairs it averages over.
    const mttrWeight = withMttr.reduce((s, m) => s + m.downtimeEvents, 0);
    const mttr = mttrWeight > 0
      ? withMttr.reduce((s, m) => s + (m.mttrHours ?? 0) * m.downtimeEvents, 0) / mttrWeight
      : null;
    return {
      // Hours arrive rounded to 0.1, so units only minutes into service can
      // sum to 0 — fall back to the plain average of their percentages.
      uptime: inService > 0
        ? Math.round((1000 * (inService - down)) / inService) / 10
        : rows.length > 0
          ? Math.round((10 * rows.reduce((s, m) => s + (m.uptimePct ?? 0), 0)) / rows.length) / 10
          : null,
      down,
      events,
      mttr,
      currentlyDown: ofKind.filter((m) => m.downSince).length,
    };
  }, [rows, ofKind]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) =>
      (a.uptimePct ?? 101) - (b.uptimePct ?? 101) || b.downtimeHours - a.downtimeHours || a.name.localeCompare(b.name)
    ),
    [rows]
  );
  const withDowntime = sorted.filter((m) => m.downtimeHours > 0 || m.downSince);
  const visible = showAll ? sorted : withDowntime;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">
        Uptime = time active ÷ time in service. Down = In Shop or Out of Service; Inactive and Disposed time is left out.
      </p>
      <div className="flex flex-wrap gap-2">
        <SegmentedControl ariaLabel="Asset kind" size="sm" options={KINDS} value={kind} onChange={setKind} />
        <SegmentedControl ariaLabel="Uptime window" size="sm" options={WINDOWS} value={windowDays} onChange={setWindowDays} />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <ReportSkeletonCard key={i} />)}
        </div>
        <div className="h-64 animate-pulse rounded-lg border bg-slate-100" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-slate-400">Uptime couldn&apos;t be loaded.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <ReportStatCard
          label="Fleet Uptime"
          value={fleet.uptime === null ? "—" : `${fleet.uptime}%`}
          valueClassName={uptimeClass(fleet.uptime)}
          sub={`${rows.length} unit${rows.length === 1 ? "" : "s"} in service`}
        />
        <ReportStatCard label="Downtime" value={hours(fleet.down)} sub={`${fleet.events} downtime event${fleet.events === 1 ? "" : "s"}`} />
        <ReportStatCard label="Avg Repair Time" value={fleet.mttr === null ? "—" : hours(fleet.mttr)} sub="Mean time to repair" />
        <ReportStatCard
          label="Down Right Now"
          value={fleet.currentlyDown}
          valueClassName={fleet.currentlyDown > 0 ? "text-red-600" : "text-slate-900"}
          sub="In shop or out of service"
        />
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Uptime by Asset
            <span className="ml-1.5 font-normal normal-case text-slate-300">({visible.length})</span>
          </p>
          <SegmentedControl
            ariaLabel="Rows shown"
            size="sm"
            options={[
              { value: "down", label: "With downtime" },
              { value: "all", label: "All in service" },
            ]}
            value={showAll ? "all" : "down"}
            onChange={(v) => setShowAll(v === "all")}
          />
        </div>
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            {rows.length === 0 ? "No assets were in service in this window." : "No downtime recorded in this window."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Uptime</TableHead>
                  <TableHead className="text-right">Downtime</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead className="text-right">Avg Repair</TableHead>
                  <TableHead className="text-right">Maint. Cost 12 mo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((m) => (
                  <TableRow key={`${m.entityType}-${m.assetId}`} className="cursor-pointer" onClick={() => openRecord(m.entityType, m.assetId)}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{m.name}</p>
                      <p className="font-mono text-xs text-slate-400">{m.assetTag}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <StatusBadge
                        variant={m.status as Parameters<typeof StatusBadge>[0]["variant"]}
                        label={ASSET_STATUS_LABELS[m.status] ?? m.status}
                      />
                      {m.downSince && <p className="mt-0.5 text-xs text-red-600">since {formatDate(m.downSince)}</p>}
                    </TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${uptimeClass(m.uptimePct)}`}>
                      {m.uptimePct === null ? "—" : `${m.uptimePct}%`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{hours(m.downtimeHours)}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.downtimeEvents}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.mttrHours === null ? "—" : hours(m.mttrHours)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(m.cost12moCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
