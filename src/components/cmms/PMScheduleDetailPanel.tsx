"use client";

import { useState } from "react";
import { formatDate, calculateNextDueDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { RecordDetailTabs } from "@/components/shared/RecordDetailTabs";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { WOHistoryTab } from "@/components/shared/WOHistoryTab";
import { Separator } from "@/components/ui/separator";
import { EditButton } from "@/components/shared/EditButton";
import { PM_FREQUENCY_LABELS } from "@/lib/constants";
import { NewPMScheduleDialog } from "./NewPMScheduleDialog";
import type { PMSchedule } from "@/types";

interface PMScheduleDetailPanelProps {
  schedule: PMSchedule;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

function DetailsTab({ schedule }: { schedule: PMSchedule }) {
  // Auto-calculate next due from last completed + frequency.
  // Fall back to the stored nextDueDate if there's no completion record yet.
  const calculatedNext = calculateNextDueDate(schedule.lastCompletedDate, schedule.frequency);
  const nextDueDisplay = calculatedNext ?? schedule.nextDueDate;

  // Warn if the calculated date differs from what's stored (data drift)
  const dateMismatch =
    calculatedNext !== null && calculatedNext !== schedule.nextDueDate;

  return (
    <div className="flex flex-col gap-5 p-6">
      <dl>
        <MetaRow label="Asset" value={schedule.assetName} />
        <MetaRow
          label="Frequency"
          value={PM_FREQUENCY_LABELS[schedule.frequency] ?? schedule.frequency}
        />
        <MetaRow
          label="Next Due"
          value={
            <span className="flex flex-col gap-0.5">
              <span>{formatDate(nextDueDisplay)}</span>
              {dateMismatch && (
                <span className="text-xs font-normal text-amber-600">
                  Calculated from last completion
                </span>
              )}
            </span>
          }
        />
        <MetaRow
          label="Last Completed"
          value={
            schedule.lastCompletedDate ? formatDate(schedule.lastCompletedDate) : null
          }
        />
        <MetaRow
          label="Status"
          value={
            schedule.isActive ? (
              <Badge
                variant="outline"
                className="border-green-200 bg-green-100 text-green-700"
              >
                Active
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-slate-200 bg-slate-100 text-slate-500"
              >
                Inactive
              </Badge>
            )
          }
        />
        <MetaRow label="Created" value={formatDate(schedule.createdAt)} />
      </dl>

      {schedule.description && (
        <>
          <Separator />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Instructions
            </p>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{schedule.description}</p>
          </div>
        </>
      )}
    </div>
  );
}

function HistoryTab({ schedule }: { schedule: PMSchedule }) {
  return (
    <div className="p-6">
      <AuditTrailTab recordType="pm_schedule" recordId={schedule.id} />
    </div>
  );
}

export function PMScheduleDetailPanel({ schedule }: PMScheduleDetailPanelProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4 pr-12">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{schedule.title}</h2>
          <p className="text-sm text-slate-500">{schedule.assetName}</p>
        </div>
        <Badge
          variant="outline"
          className={
            schedule.isActive
              ? "border-green-200 bg-green-100 text-green-700"
              : "border-slate-200 bg-slate-100 text-slate-500"
          }
        >
          {schedule.isActive ? "Active" : "Inactive"}
        </Badge>
        <EditButton onClick={() => setEditOpen(true)} />
      </div>

      <RecordDetailTabs
        tabs={[
          {
            value: "details",
            label: "Details",
            content: <DetailsTab schedule={schedule} />,
          },
          {
            value: "wo-history",
            label: "WO History",
            content: <WOHistoryTab assetId={schedule.assetId} recordLabel="PM schedule" />,
          },
          {
            value: "history",
            label: "Audit Trail",
            content: <HistoryTab schedule={schedule} />,
          },
        ]}
      />
      <NewPMScheduleDialog open={editOpen} onOpenChange={setEditOpen} initialData={schedule} />
    </div>
  );
}
