"use client";

import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportSkeletonCard, ReportStatCard } from "@/components/shared/ReportStatCard";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { useAssets } from "@/lib/hooks/use-assets";
import { useVehicles } from "@/lib/hooks/use-vehicles";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import { useOpenAssetRecord } from "@/lib/hooks/use-open-asset-record";
import { cn, formatDate } from "@/lib/utils";
import {
  formatWarrantyCountdown,
  getWarrantyStatus,
  type WarrantyState,
} from "@/lib/utils/warranty";

type Filter = "expiring_30" | "expiring_90" | "expired" | "covered" | "none";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "expiring_30", label: "Next 30 days" },
  { value: "expiring_90", label: "Next 90 days" },
  { value: "covered", label: "All under warranty" },
  { value: "expired", label: "Expired" },
  { value: "none", label: "No warranty" },
];

const STATE_LABEL: Record<WarrantyState, string> = {
  active: "Active",
  expiring: "Expiring soon",
  expired: "Expired",
  none: "None on file",
};

const STATE_CLASS: Record<WarrantyState, string> = {
  active: "bg-green-50 text-green-700",
  expiring: "bg-amber-50 text-amber-700",
  expired: "bg-red-50 text-red-700",
  none: "bg-slate-100 text-slate-500",
};

interface Row {
  entityType: "asset" | "vehicle";
  id: string;
  name: string;
  assetTag: string;
  assetType: string;
  warrantyEndDate: string | null;
  warrantyNotes: string | null;
  state: WarrantyState;
  daysLeft: number | null;
}

export function WarrantyReport() {
  const { data: assets = [], isLoading: loadingAssets } = useAssets();
  const { data: vehicles = [], isLoading: loadingVehicles } = useVehicles();
  const { today } = useOrgDates();
  const openRecord = useOpenAssetRecord();
  const [filter, setFilter] = useState<Filter>("expiring_90");

  const todayStr = today();
  const rows = useMemo<Row[]>(() => {
    const all = [
      ...assets.map((a) => ({ ...a, entityType: "asset" as const })),
      ...vehicles.map((v) => ({ ...v, entityType: "vehicle" as const })),
    ];
    return all
      // A disposed unit's warranty no longer matters to anyone.
      .filter((r) => r.status !== "disposed")
      .map((r) => {
        const s = getWarrantyStatus(r.warrantyEndDate, todayStr);
        return {
          entityType: r.entityType,
          id: r.id,
          name: r.name,
          assetTag: r.assetTag,
          assetType: r.assetType,
          warrantyEndDate: r.warrantyEndDate,
          warrantyNotes: r.warrantyNotes,
          state: s.state,
          daysLeft: s.daysLeft,
        };
      });
  }, [assets, vehicles, todayStr]);

  const counts = useMemo(() => ({
    active: rows.filter((r) => r.state === "active").length,
    expiring: rows.filter((r) => r.state === "expiring").length,
    expired: rows.filter((r) => r.state === "expired").length,
    none: rows.filter((r) => r.state === "none").length,
  }), [rows]);

  const visible = useMemo(() => {
    const matches = (r: Row) => {
      switch (filter) {
        case "expiring_30": return r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= 30;
        case "expiring_90": return r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= 90;
        case "covered":     return r.daysLeft !== null && r.daysLeft >= 0;
        case "expired":     return r.state === "expired";
        case "none":        return r.state === "none";
      }
    };
    return rows
      .filter(matches)
      .sort((a, b) =>
        filter === "expired"
          ? (b.warrantyEndDate ?? "").localeCompare(a.warrantyEndDate ?? "")
          : filter === "none"
            ? a.name.localeCompare(b.name)
            : (a.warrantyEndDate ?? "").localeCompare(b.warrantyEndDate ?? "")
      );
  }, [rows, filter]);

  if (loadingAssets || loadingVehicles) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <ReportSkeletonCard key={i} />)}
        </div>
        <div className="h-64 animate-pulse rounded-lg border bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <ReportStatCard label="Under Warranty" value={counts.active + counts.expiring} sub="Assets & vehicles" />
        <ReportStatCard
          label="Expiring ≤ 90 Days"
          value={counts.expiring}
          valueClassName={counts.expiring > 0 ? "text-amber-600" : "text-slate-900"}
          sub="Book warranty work before it lapses"
        />
        <ReportStatCard label="Expired" value={counts.expired} />
        <ReportStatCard label="No Warranty on File" value={counts.none} />
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Warranty End Dates
            <span className="ml-1.5 font-normal normal-case text-slate-300">({visible.length})</span>
          </p>
          <SegmentedControl ariaLabel="Warranty filter" size="sm" options={FILTERS} value={filter} onChange={setFilter} />
        </div>
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            {filter === "none" ? "Every active asset has a warranty on file." : "Nothing matches this filter."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Coverage Ends</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow
                    key={`${r.entityType}-${r.id}`}
                    className="cursor-pointer"
                    onClick={() => openRecord(r.entityType, r.id)}
                  >
                    <TableCell className="font-medium text-slate-900">{r.name}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{r.assetTag}</TableCell>
                    <TableCell className="text-slate-600">
                      {r.entityType === "vehicle" ? "Vehicle" : r.assetType.replace(/_/g, " ") || "Asset"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.warrantyEndDate ? formatDate(r.warrantyEndDate) : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATE_CLASS[r.state])}>
                        {STATE_LABEL[r.state]}
                      </span>
                      {r.daysLeft !== null && (
                        <span className="ml-2 text-xs text-slate-500">{formatWarrantyCountdown(r.daysLeft)}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate text-slate-500 md:table-cell">{r.warrantyNotes ?? ""}</TableCell>
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
