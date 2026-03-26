"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { RecordDetailTabs } from "@/components/shared/RecordDetailTabs";
import { CommentsSection } from "@/components/shared/CommentsSection";
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { EditButton } from "@/components/shared/EditButton";
import { StatusFlowIndicator } from "@/components/shared/StatusFlowIndicator";
import { WOCostsTab } from "@/components/cmms/WOCostsTab";
import { AssetDetailPanel } from "./AssetDetailPanel";
import { VehicleDetailPanel } from "./VehicleDetailPanel";
import { NewWorkOrderDialog } from "./NewWorkOrderDialog";
import { WO_STATUS_LABELS, WO_PRIORITY_LABELS, ASSET_STATUS_LABELS } from "@/lib/constants";
import { useAssets, useUpdateAssetStatus } from "@/lib/hooks/use-assets";
import { useVehicles, useUpdateVehicleStatus } from "@/lib/hooks/use-vehicles";
import { useWorkOrders } from "@/lib/hooks/use-work-orders";
import { useCMMSStore } from "@/stores";
import { printWO } from "@/lib/print";
import { Download, GitBranch, CheckCircle2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkOrder, WorkOrderStatus, AssetStatus } from "@/types";

interface WorkOrderDetailPanelProps {
  workOrder: WorkOrder;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

const ASSET_STATUS_OPTIONS: Array<{ value: AssetStatus; label: string }> = [
  { value: "active",         label: ASSET_STATUS_LABELS.active },
  { value: "inactive",       label: ASSET_STATUS_LABELS.inactive },
  { value: "in_shop",        label: ASSET_STATUS_LABELS.in_shop },
  { value: "out_of_service", label: ASSET_STATUS_LABELS.out_of_service },
  { value: "disposed",       label: ASSET_STATUS_LABELS.disposed },
];

const WO_FLOW_STEPS = [
  { label: "Open" },
  { label: "In Progress" },
  { label: "Done" },
];

const WO_STATUS_INDEX: Record<string, number> = {
  open: 0,
  on_hold: 0,
  in_progress: 1,
  done: 2,
};

function WOLinkCard({ wo, onClick }: { wo: WorkOrder; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left transition-colors hover:bg-slate-100"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{wo.workOrderNumber}</p>
        <p className="truncate text-sm font-medium text-slate-800">{wo.assetName ?? wo.title}</p>
        {wo.assignedToName && (
          <p className="text-xs text-slate-400">{wo.assignedToName}</p>
        )}
      </div>
      <StatusBadge variant={wo.status} label={WO_STATUS_LABELS[wo.status]} />
    </button>
  );
}

function SubWorkOrdersSection({
  subWorkOrders,
  onSubWOClick,
}: {
  subWorkOrders: WorkOrder[];
  onSubWOClick: (id: string) => void;
}) {
  if (subWorkOrders.length === 0) return null;
  return (
    <>
      <Separator />
      <div>
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <GitBranch className="h-3.5 w-3.5" />
          Sub Work Orders
        </p>
        <div className="flex flex-col gap-1.5">
          {subWorkOrders.map((sub) => (
            <WOLinkCard key={sub.id} wo={sub} onClick={() => onSubWOClick(sub.id)} />
          ))}
        </div>
      </div>
    </>
  );
}

function ParentWorkOrderSection({
  parentWorkOrder,
  onParentWOClick,
}: {
  parentWorkOrder: WorkOrder;
  onParentWOClick: () => void;
}) {
  return (
    <>
      <Separator />
      <div>
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <GitBranch className="h-3.5 w-3.5" />
          Parent Work Order
        </p>
        <WOLinkCard wo={parentWorkOrder} onClick={onParentWOClick} />
      </div>
    </>
  );
}

function DetailsTab({
  workOrder,
  status,
  onStatusChange,
  onAssetClick,
  onVehicleClick,
  subWorkOrders,
  parentWorkOrder,
  onSubWOClick,
  onParentWOClick,
}: {
  workOrder: WorkOrder;
  status: WorkOrderStatus;
  onStatusChange: (s: WorkOrderStatus) => void;
  onAssetClick?: () => void;
  onVehicleClick?: () => void;
  subWorkOrders: WorkOrder[];
  parentWorkOrder: WorkOrder | null;
  onSubWOClick: (id: string) => void;
  onParentWOClick: () => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [newEntityStatus, setNewEntityStatus] = useState<AssetStatus | "no_change">("no_change");

  const { mutate: updateAssetStatus } = useUpdateAssetStatus();
  const { mutate: updateVehicleStatus } = useUpdateVehicleStatus();

  const hasLinkedEntity = !!workOrder.assetId && !!workOrder.linkedEntityType;
  const entityLabel = workOrder.linkedEntityType === "vehicle" ? "Vehicle" : "Asset";

  function handleConfirmComplete() {
    if (hasLinkedEntity && newEntityStatus !== "no_change" && workOrder.assetId) {
      if (workOrder.linkedEntityType === "vehicle") {
        updateVehicleStatus({ id: workOrder.assetId, status: newEntityStatus });
      } else {
        updateAssetStatus({ id: workOrder.assetId, status: newEntityStatus });
      }
    }
    onStatusChange("done");
    setCompleting(false);
    setNewEntityStatus("no_change");
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Status
        </p>
        <StatusFlowIndicator
          steps={WO_FLOW_STEPS}
          currentIndex={WO_STATUS_INDEX[status] ?? 0}
        />

        {/* Inline completion card */}
        {completing && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-800">Mark Work Order Complete</span>
            </div>
            {hasLinkedEntity && (
              <div className="mb-3">
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  Update {entityLabel} Status
                  <span className="ml-1.5 font-normal text-slate-400">(optional)</span>
                </label>
                <Select
                  value={newEntityStatus}
                  onValueChange={(v) => setNewEntityStatus(v as AssetStatus | "no_change")}
                >
                  <SelectTrigger className="h-8 bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_change">No change</SelectItem>
                    {ASSET_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleConfirmComplete}>
                Confirm Complete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setCompleting(false); setNewEntityStatus("no_change"); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Action strip */}
        {!completing && (
          <div className="mt-3 flex flex-wrap gap-2">
            {status === "open" && (<>
              <Button size="sm" onClick={() => onStatusChange("in_progress")}>Start Work</Button>
              <Button size="sm" variant="outline" onClick={() => onStatusChange("on_hold")}>Put On Hold</Button>
            </>)}
            {status === "in_progress" && (<>
              <Button size="sm" onClick={() => setCompleting(true)}>Mark Complete</Button>
              <Button size="sm" variant="outline" onClick={() => onStatusChange("on_hold")}>Put On Hold</Button>
            </>)}
            {status === "on_hold" && (<>
              <Button size="sm" onClick={() => onStatusChange("in_progress")}>Resume Work</Button>
              <Button size="sm" variant="outline" onClick={() => setCompleting(true)}>Mark Complete</Button>
            </>)}
            {status === "done" && (
              <Button size="sm" variant="outline" onClick={() => onStatusChange("open")}>Reopen</Button>
            )}
          </div>
        )}
      </div>

      <Separator />

      <dl>
        <MetaRow
          label="Status"
          value={
            <StatusBadge
              variant={status}
              label={WO_STATUS_LABELS[status]}
            />
          }
        />
        <MetaRow
          label="Priority"
          value={
            <StatusBadge
              variant={workOrder.priority}
              label={WO_PRIORITY_LABELS[workOrder.priority]}
            />
          }
        />
        <MetaRow
          label={workOrder.linkedEntityType === "vehicle" ? "Vehicle" : "Asset"}
          value={(() => {
            if (!workOrder.assetName) return null;
            const clickHandler =
              workOrder.linkedEntityType === "vehicle" ? onVehicleClick : onAssetClick;
            return clickHandler ? (
              <button
                type="button"
                onClick={clickHandler}
                className="text-left font-medium text-brand-600 hover:underline"
              >
                {workOrder.assetName}
              </button>
            ) : (
              workOrder.assetName
            );
          })()}
        />
        <MetaRow label="Assigned To" value={workOrder.assignedToName} />
        <MetaRow label="Category" value={workOrder.category} />
        <MetaRow
          label="Type"
          value={
            workOrder.woType === "reactive"
              ? "Reactive"
              : workOrder.woType === "preventive"
              ? "Preventive"
              : null
          }
        />
        {workOrder.isRecurring && workOrder.recurrenceFrequency && (
          <MetaRow
            label="Recurrence"
            value={
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                {{
                  daily: "Daily",
                  weekly: "Weekly",
                  biweekly: "Bi-weekly",
                  monthly: "Monthly",
                  quarterly: "Quarterly",
                  yearly: "Yearly",
                }[workOrder.recurrenceFrequency]}
              </span>
            }
          />
        )}
        <MetaRow
          label="Due Date"
          value={workOrder.dueDate ? formatDate(workOrder.dueDate) : null}
        />
        <MetaRow label="Created" value={formatDate(workOrder.createdAt)} />
        <MetaRow label="Updated" value={formatDate(workOrder.updatedAt)} />
      </dl>

      {workOrder.description && (
        <>
          <Separator />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Description
            </p>
            <p className="text-sm text-slate-700">{workOrder.description}</p>
          </div>
        </>
      )}

      <SubWorkOrdersSection subWorkOrders={subWorkOrders} onSubWOClick={onSubWOClick} />

      {parentWorkOrder && (
        <ParentWorkOrderSection
          parentWorkOrder={parentWorkOrder}
          onParentWOClick={onParentWOClick}
        />
      )}
    </div>
  );
}

function HistoryTab({ workOrder }: { workOrder: WorkOrder }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Comments
        </p>
        <CommentsSection recordType="work_order" recordId={workOrder.id} />
      </div>
      <Separator className="mb-6" />
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Audit Trail
      </p>
      <AuditTrailTab recordType="work_order" recordId={workOrder.id} />
    </div>
  );
}

function FilesTab({ workOrder }: { workOrder: WorkOrder }) {
  return (
    <div className="p-6">
      <AttachmentsSection recordType="work_order" recordId={workOrder.id} />
    </div>
  );
}

export function WorkOrderDetailPanel({ workOrder }: WorkOrderDetailPanelProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [assetSheetOpen, setAssetSheetOpen] = useState(false);
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [subWOSheetId, setSubWOSheetId] = useState<string | null>(null);
  const [parentWOSheetOpen, setParentWOSheetOpen] = useState(false);
  const [status, setStatus] = useState<WorkOrderStatus>(workOrder.status);
  const { data: assets = [] } = useAssets();
  const { data: vehicles = [] } = useVehicles();
  const { data: allWorkOrders = [] } = useWorkOrders();
  const { setSelectedWorkOrderId } = useCMMSStore();
  const linkedAsset =
    workOrder.assetId && workOrder.linkedEntityType !== "vehicle"
      ? (assets.find((a) => a.id === workOrder.assetId) ?? null)
      : null;
  const linkedVehicle =
    workOrder.assetId && workOrder.linkedEntityType === "vehicle"
      ? (vehicles.find((v) => v.id === workOrder.assetId) ?? null)
      : null;

  // Sub work orders (children of this WO)
  const subWorkOrders = allWorkOrders.filter((wo) => wo.parentWorkOrderId === workOrder.id);
  // Parent WO (if this is a child)
  const parentWorkOrder = workOrder.parentWorkOrderId
    ? (allWorkOrders.find((wo) => wo.id === workOrder.parentWorkOrderId) ?? null)
    : null;
  // WO to show in the sub-WO overlay sheet
  const subWOSheetWorkOrder = subWOSheetId
    ? (allWorkOrders.find((wo) => wo.id === subWOSheetId) ?? null)
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4 pr-12">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {workOrder.workOrderNumber}
          </h2>
          <p className="text-sm text-slate-500">{workOrder.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            variant={status}
            label={WO_STATUS_LABELS[status]}
          />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printWO(workOrder)}>
            <Download className="h-3.5 w-3.5" />
            PDF
          </Button>
          <EditButton onClick={() => setEditOpen(true)} />
        </div>
      </div>

      <RecordDetailTabs
        tabs={[
          {
            value: "details",
            label: "Details",
            content: (
              <DetailsTab
                workOrder={workOrder}
                status={status}
                onStatusChange={setStatus}
                onAssetClick={linkedAsset ? () => setAssetSheetOpen(true) : undefined}
                onVehicleClick={linkedVehicle ? () => setVehicleSheetOpen(true) : undefined}
                subWorkOrders={subWorkOrders}
                parentWorkOrder={parentWorkOrder}
                onSubWOClick={(id) => setSubWOSheetId(id)}
                onParentWOClick={() => setParentWOSheetOpen(true)}
              />
            ),
          },
          {
            value: "costs",
            label: "Costs",
            content: <WOCostsTab workOrderId={workOrder.id} />,
          },
          {
            value: "history",
            label: "Comments & History",
            content: <HistoryTab workOrder={workOrder} />,
          },
          {
            value: "files",
            label: "Files",
            content: <FilesTab workOrder={workOrder} />,
          },
        ]}
      />

      {/* Asset detail overlay */}
      <Sheet open={assetSheetOpen && !!linkedAsset} onOpenChange={setAssetSheetOpen}>
        <SheetContent className="flex w-[720px] flex-col overflow-hidden p-0 sm:max-w-[720px]">
          {linkedAsset && <AssetDetailPanel asset={linkedAsset} />}
        </SheetContent>
      </Sheet>

      {/* Vehicle detail overlay */}
      <Sheet open={vehicleSheetOpen && !!linkedVehicle} onOpenChange={setVehicleSheetOpen}>
        <SheetContent className="flex w-[580px] flex-col overflow-hidden p-0 sm:max-w-[580px]">
          {linkedVehicle && <VehicleDetailPanel vehicle={linkedVehicle} />}
        </SheetContent>
      </Sheet>

      {/* Sub work order detail overlay */}
      <Sheet open={!!subWOSheetWorkOrder} onOpenChange={(o) => { if (!o) setSubWOSheetId(null); }}>
        <SheetContent className="flex w-[580px] flex-col overflow-hidden p-0 sm:max-w-[580px]">
          {subWOSheetWorkOrder && (
            <WorkOrderDetailPanel workOrder={subWOSheetWorkOrder} />
          )}
        </SheetContent>
      </Sheet>

      {/* Parent work order detail overlay */}
      <Sheet open={parentWOSheetOpen && !!parentWorkOrder} onOpenChange={setParentWOSheetOpen}>
        <SheetContent className="flex w-[580px] flex-col overflow-hidden p-0 sm:max-w-[580px]">
          {parentWorkOrder && (
            <WorkOrderDetailPanel workOrder={parentWorkOrder} />
          )}
        </SheetContent>
      </Sheet>

      <NewWorkOrderDialog open={editOpen} onOpenChange={setEditOpen} initialData={workOrder} />
    </div>
  );
}
