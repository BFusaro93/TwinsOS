"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, calculateNextDueDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RecordDetailTabs } from "@/components/shared/RecordDetailTabs";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { Separator } from "@/components/ui/separator";
import { EditButton } from "@/components/shared/EditButton";
import { PM_FREQUENCY_LABELS } from "@/lib/constants";
import { NewPMScheduleDialog } from "./NewPMScheduleDialog";
import { PMPartsTab } from "./PMPartsTab";
import { PMScheduleAssetsTab } from "./PMScheduleAssetsTab";
import { useDeletePMSchedule } from "@/lib/hooks/use-pm-schedules";
import { usePMScheduleAssets } from "@/lib/hooks/use-pm-schedule-assets";
import { useCMMSStore } from "@/stores";
import { Trash2, Play } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkOrders } from "@/lib/hooks/use-work-orders";
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
  const { data: scheduleAssets } = usePMScheduleAssets(schedule.id);
  const assetCount = scheduleAssets?.length ?? 0;

  const calculatedNext = calculateNextDueDate(schedule.lastCompletedDate, schedule.frequency);
  const nextDueDisplay = calculatedNext ?? schedule.nextDueDate;
  const dateMismatch = calculatedNext !== null && calculatedNext !== schedule.nextDueDate;

  return (
    <div className="flex flex-col gap-5 p-6">
      <dl>
        <MetaRow
          label="Assets"
          value={
            assetCount > 0
              ? `${assetCount} ${assetCount === 1 ? "asset" : "assets"} — see Assets tab`
              : "—"
          }
        />
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
          value={schedule.lastCompletedDate ? formatDate(schedule.lastCompletedDate) : null}
        />
        <MetaRow
          label="Status"
          value={
            schedule.isActive ? (
              <Badge variant="outline" className="border-green-200 bg-green-100 text-green-700">
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-500">
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

export function PMScheduleDetailPanel({ schedule }: PMScheduleDetailPanelProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const { mutate: deletePMSchedule, isPending: deleting } = useDeletePMSchedule();
  const { setSelectedPMScheduleId, setSelectedWorkOrderId } = useCMMSStore();
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: scheduleAssets } = usePMScheduleAssets(schedule.id);
  const hasAssets = (scheduleAssets?.length ?? 0) > 0;

  async function handleGenerateWOs() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch(`/api/pm-schedules/${schedule.id}/generate-wo`, { method: "POST" });
      const json = await res.json() as { parentWorkOrderId?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to generate work orders");
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["pm-schedules"] });
      if (json.parentWorkOrderId) {
        setSelectedWorkOrderId(json.parentWorkOrderId);
        router.push("/cmms/work-orders");
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4 pr-12">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{schedule.title}</h2>
          <p className="text-sm text-slate-500">
            {PM_FREQUENCY_LABELS[schedule.frequency] ?? schedule.frequency}
            {scheduleAssets && scheduleAssets.length > 0 && ` · ${scheduleAssets.length} asset${scheduleAssets.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

          {/* Generate Work Orders button */}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            disabled={!hasAssets || generating}
            onClick={handleGenerateWOs}
            title={hasAssets ? "Generate a parent WO + sub-WOs for each asset" : "Add assets to this schedule first"}
          >
            <Play className="h-3.5 w-3.5" />
            {generating ? "Generating…" : "Generate WOs"}
          </Button>

          <EditButton onClick={() => setEditOpen(true)} />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-500"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {generateError && (
        <div className="border-b bg-red-50 px-6 py-2 text-sm text-red-700">
          {generateError}
        </div>
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete PM Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{schedule.title}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
              disabled={deleting}
              onClick={() =>
                deletePMSchedule(schedule.id, {
                  onSuccess: () => {
                    setDeleteConfirmOpen(false);
                    setSelectedPMScheduleId(null);
                  },
                })
              }
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecordDetailTabs
        tabs={[
          {
            value: "details",
            label: "Details",
            content: <DetailsTab schedule={schedule} />,
          },
          {
            value: "assets",
            label: `Assets${scheduleAssets && scheduleAssets.length > 0 ? ` (${scheduleAssets.length})` : ""}`,
            content: <PMScheduleAssetsTab pmScheduleId={schedule.id} />,
          },
          {
            value: "parts",
            label: "Parts",
            content: <PMPartsTab pmScheduleId={schedule.id} />,
          },
          {
            value: "wo-history",
            label: "WO History",
            content: (
              <div className="p-6">
                <p className="mb-4 text-xs text-slate-400">Work orders generated from this schedule</p>
                <PMScheduleWOHistory pmScheduleId={schedule.id} />
              </div>
            ),
          },
          {
            value: "history",
            label: "Audit Trail",
            content: (
              <div className="p-6">
                <AuditTrailTab recordType="pm_schedule" recordId={schedule.id} />
              </div>
            ),
          },
        ]}
      />
      <NewPMScheduleDialog open={editOpen} onOpenChange={setEditOpen} initialData={schedule} />
    </div>
  );
}

// ── WO History sub-component ──────────────────────────────────────────────────

function PMScheduleWOHistory({ pmScheduleId }: { pmScheduleId: string }) {
  const { setSelectedWorkOrderId } = useCMMSStore();
  const { data: allWOs } = useWorkOrders();

  const wos = (allWOs ?? [])
    .filter((wo) => wo.pmScheduleId === pmScheduleId && !wo.parentWorkOrderId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (wos.length === 0) {
    return <p className="text-sm text-slate-400 italic">No work orders generated yet.</p>;
  }

  return (
    <div className="flex flex-col divide-y rounded border">
      {wos.map((wo) => (
        <button
          key={wo.id}
          type="button"
          onClick={() => setSelectedWorkOrderId(wo.id)}
          className="flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-slate-50"
        >
          <span className="font-medium text-slate-800">{wo.title}</span>
          <span className="ml-2 shrink-0 text-xs text-slate-400">{wo.workOrderNumber}</span>
        </button>
      ))}
    </div>
  );
}
