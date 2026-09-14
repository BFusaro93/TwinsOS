"use client";

import { ClipboardCheck, Droplets, FileCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn, formatDate, getInitials, getAvatarColor, todayLocalISODate, localISODateFromToday } from "@/lib/utils";
import { ASSET_STATUS_LABELS } from "@/lib/constants";
import type { Vehicle } from "@/types";

type ServiceBucket = "overdue" | "due-soon" | "ok" | "untracked";

function getVehicleBucket(v: Vehicle, currentMiles?: number | null): ServiceBucket {
  const todayStr = todayLocalISODate();
  const monthOut = localISODateFromToday(30);

  const hasDates = !!(v.nextOilChangeDue || v.nextInspectionStickerDue);
  const hasMileage = v.nextOilChangeMileage != null && currentMiles != null;
  if (!hasDates && !hasMileage) return "untracked";

  const dateDates = [v.nextOilChangeDue, v.nextInspectionStickerDue].filter(Boolean) as string[];
  if (dateDates.some((d) => d < todayStr)) return "overdue";
  if (hasMileage && currentMiles! >= v.nextOilChangeMileage!) return "overdue";
  if (dateDates.some((d) => d < monthOut)) return "due-soon";
  if (hasMileage && currentMiles! >= v.nextOilChangeMileage! - 500) return "due-soon";
  return "ok";
}

function dateCell(dateStr: string | null, dueMileage?: number | null, currentMiles?: number | null): React.ReactNode {
  if (!dateStr && dueMileage == null) return <span className="text-slate-300">—</span>;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = todayLocalISODate();
  const monthOut = localISODateFromToday(30);

  const dateColor = dateStr
    ? dateStr < todayStr ? "text-red-600" : dateStr < monthOut ? "text-amber-600" : "text-green-700"
    : "text-slate-500";

  const daysLabel = (() => {
    if (!dateStr) return null;
    const diff = Math.floor((new Date(dateStr).getTime() - today.getTime()) / 86400000);
    if (diff < 0)  return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return "Today";
    if (diff <= 30) return `${diff}d`;
    return null;
  })();

  const mileageColor = (() => {
    if (dueMileage == null || currentMiles == null) return "text-slate-500";
    const remaining = dueMileage - currentMiles;
    if (remaining <= 0)   return "text-red-600";
    if (remaining <= 500) return "text-amber-600";
    return "text-green-700";
  })();

  const mileageLabel = (() => {
    if (dueMileage == null || currentMiles == null) return null;
    const remaining = dueMileage - currentMiles;
    if (remaining <= 0)   return `${Math.abs(remaining).toLocaleString()} mi overdue`;
    if (remaining <= 500) return `${remaining.toLocaleString()} mi away`;
    return null;
  })();

  return (
    <div className="flex flex-col gap-0.5">
      {dateStr && (
        <span className={cn("text-sm font-medium", dateColor)}>
          {formatDate(dateStr)}
          {daysLabel && <span className="ml-1.5 text-xs font-normal opacity-75">({daysLabel})</span>}
        </span>
      )}
      {dueMileage != null && (
        <span className={cn("text-xs font-medium", mileageColor)}>
          {dueMileage.toLocaleString()} mi
          {mileageLabel && <span className="ml-1 font-normal opacity-75">({mileageLabel})</span>}
        </span>
      )}
    </div>
  );
}

function SectionHeader({ label, count, variant = "default" }: {
  label: string;
  count: number;
  variant?: "default" | "overdue" | "complete";
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={6}
        className={cn(
          "py-2 pl-4 text-xs font-semibold uppercase tracking-wide",
          variant === "overdue"  && "bg-red-50 text-red-700",
          variant === "complete" && "bg-green-50 text-green-700",
          variant === "default"  && "bg-slate-50 text-slate-500",
        )}
      >
        {label}
        <span className="ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-medium">{count}</span>
      </TableCell>
    </TableRow>
  );
}

export function ServiceRemindersView({
  vehicles,
  isLoading,
  onRowClick,
  currentMilesMap,
}: {
  vehicles: Vehicle[];
  isLoading: boolean;
  onRowClick: (v: Vehicle) => void;
  currentMilesMap: Map<string, number>;
}) {
  const bucket = (v: Vehicle) => getVehicleBucket(v, currentMilesMap.get(v.id));
  const tracked   = vehicles.filter((v) => bucket(v) !== "untracked");
  const untracked = vehicles.filter((v) => bucket(v) === "untracked");
  const overdue   = tracked.filter((v) => bucket(v) === "overdue");
  const dueSoon   = tracked.filter((v) => bucket(v) === "due-soon");
  const upToDate  = tracked.filter((v) => bucket(v) === "ok");

  if (!isLoading && vehicles.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No service reminders"
        description="Open a vehicle and set oil change or inspection sticker due dates to start tracking."
      />
    );
  }

  function VehicleRow({ v }: { v: Vehicle }) {
    const initials = getInitials(v.name);
    const avatarColor = getAvatarColor(v.name);
    const currentMiles = currentMilesMap.get(v.id) ?? null;
    return (
      <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => onRowClick(v)}>
        <TableCell>
          <div className="flex items-center gap-2.5">
            {v.photoUrl ? (
              <img src={v.photoUrl} alt={v.name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", avatarColor)}>
                {initials}
              </div>
            )}
            <div>
              <p className="font-medium text-slate-900">{v.name}</p>
              <p className="text-xs text-slate-400">{v.licensePlate ?? v.assetTag}</p>
            </div>
          </div>
        </TableCell>
        <TableCell className="font-mono text-xs text-slate-500">{v.assetTag}</TableCell>
        <TableCell className="text-sm text-slate-600">{v.assignedCrew ?? "—"}</TableCell>
        <TableCell>
          {v.nextOilChangeDue || v.nextOilChangeMileage != null
            ? dateCell(v.nextOilChangeDue, v.nextOilChangeMileage, currentMiles)
            : <span className="text-slate-300">—</span>}
        </TableCell>
        <TableCell>
          {v.nextInspectionStickerDue
            ? dateCell(v.nextInspectionStickerDue)
            : <span className="text-slate-300">—</span>}
        </TableCell>
        <TableCell>
          <StatusBadge
            variant={v.status as Parameters<typeof StatusBadge>[0]["variant"]}
            label={ASSET_STATUS_LABELS[v.status] ?? v.status}
          />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <ClipboardCheck className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-amber-900">
            {tracked.length} vehicle{tracked.length !== 1 ? "s" : ""} tracked
            {overdue.length > 0 && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                {overdue.length} overdue
              </span>
            )}
            {dueSoon.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {dueSoon.length} due within 30 days
              </span>
            )}
          </p>
          <p className="text-xs text-amber-700">Click any row to open the vehicle and reset a reminder.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Vehicle</TableHead>
              <TableHead>Asset Tag</TableHead>
              <TableHead>Assigned Crew</TableHead>
              <TableHead>
                <span className="flex items-center gap-1.5">
                  <Droplets className="h-3.5 w-3.5 text-slate-400" />
                  Oil Change Due
                </span>
              </TableHead>
              <TableHead>
                <span className="flex items-center gap-1.5">
                  <FileCheck className="h-3.5 w-3.5 text-slate-400" />
                  Inspection Sticker Due
                </span>
              </TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))}

            {!isLoading && (
              <>
                {overdue.length > 0 && (
                  <>
                    <SectionHeader label="Overdue" count={overdue.length} variant="overdue" />
                    {overdue.map((v) => <VehicleRow key={v.id} v={v} />)}
                  </>
                )}
                {dueSoon.length > 0 && (
                  <>
                    <SectionHeader label="Due Within 30 Days" count={dueSoon.length} />
                    {dueSoon.map((v) => <VehicleRow key={v.id} v={v} />)}
                  </>
                )}
                {upToDate.length > 0 && (
                  <>
                    <SectionHeader label="Up to Date" count={upToDate.length} variant="complete" />
                    {upToDate.map((v) => <VehicleRow key={v.id} v={v} />)}
                  </>
                )}
                {untracked.length > 0 && (
                  <>
                    <SectionHeader label="Not Tracked" count={untracked.length} />
                    {untracked.map((v) => <VehicleRow key={v.id} v={v} />)}
                  </>
                )}
                {vehicles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-sm text-slate-400">
                      No vehicles found
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
