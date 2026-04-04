"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { RecordDetailTabs } from "@/components/shared/RecordDetailTabs";
import { CommentsSection } from "@/components/shared/CommentsSection";
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { EditButton } from "@/components/shared/EditButton";
import { StatusFlowIndicator } from "@/components/shared/StatusFlowIndicator";
import { WOCostsTab } from "@/components/cmms/WOCostsTab";
import { AssetDetailPanel } from "./AssetDetailPanel";
import { VehicleDetailPanel } from "./VehicleDetailPanel";
import { NewWorkOrderDialog } from "./NewWorkOrderDialog";
import { WO_STATUS_LABELS, WO_PRIORITY_LABELS, ASSET_STATUS_LABELS, ASSET_STATUS_COLORS } from "@/lib/constants";
import { useAssets, useUpdateAssetStatus } from "@/lib/hooks/use-assets";
import { useVehicles, useUpdateVehicleStatus } from "@/lib/hooks/use-vehicles";
import { useWorkOrders, useUpdateWorkOrder, useUpdateWorkOrderStatus, useDeleteWorkOrder } from "@/lib/hooks/use-work-orders";
import { useUsers } from "@/lib/hooks/use-users";
import { useCMMSStore, useSettingsStore } from "@/stores";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";
import { printWO } from "@/lib/print";
import { useWOParts } from "@/lib/hooks/use-wo-costs";
import { OverlayLevelContext, overlayZ, useOverlayLevel } from "@/lib/overlay-level";
import { Download, GitBranch, CheckCircle2, Trash2, X } from "lucide-react";
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
        {(wo.assignedToNames.length > 0 || wo.assignedToName) && (
          <p className="text-xs text-slate-400">
            {wo.assignedToNames.length > 0 ? wo.assignedToNames.join(", ") : wo.assignedToName}
          </p>
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
  initialEntityStatus,
  subWorkOrders,
  parentWorkOrder,
  onSubWOClick,
  onParentWOClick,
  onAssigneeChange,
  onCategoryChange,
  users,
  woCategories,
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
  onAssigneeChange: (ids: string[], names: string[]) => void;
  onCategoryChange: (categories: string[]) => void;
  users: Array<{ id: string; name: string }>;
  woCategories: Array<{ id: string; label: string; enabled: boolean }>;
  initialEntityStatus?: AssetStatus;
}) {
  const [completing, setCompleting] = useState(false);
  const [newEntityStatus, setNewEntityStatus] = useState<AssetStatus | "no_change">("no_change");
  const [entityStatus, setEntityStatus] = useState<AssetStatus>(initialEntityStatus ?? "active");

  // Sync entityStatus when the linked asset/vehicle status changes in the cache
  // (e.g. updated from this same panel or from the vehicle/asset detail panel).
  useEffect(() => {
    if (initialEntityStatus) setEntityStatus(initialEntityStatus);
  }, [initialEntityStatus]);

  const { mutate: updateAssetStatus } = useUpdateAssetStatus();
  const { mutate: updateVehicleStatus } = useUpdateVehicleStatus();

  const hasLinkedEntity = !!workOrder.assetId;
  // Determine entity type: use linkedEntityType if set, otherwise infer from click handlers
  const resolvedEntityType = workOrder.linkedEntityType
    ?? (onVehicleClick ? "vehicle" : "asset");
  const entityLabel = resolvedEntityType === "vehicle" ? "Vehicle" : "Asset";

  function handleConfirmComplete() {
    if (hasLinkedEntity && newEntityStatus !== "no_change" && workOrder.assetId) {
      if (resolvedEntityType === "vehicle") {
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
          label={onVehicleClick ? "Vehicle" : "Asset"}
          value={(() => {
            if (!workOrder.assetName) return null;
            const clickHandler = onVehicleClick ?? onAssetClick;
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
        {hasLinkedEntity && (
          <MetaRow
            label={`${entityLabel} Status`}
            value={
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:opacity-80 ${ASSET_STATUS_COLORS[entityStatus] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}
                  >
                    {ASSET_STATUS_LABELS[entityStatus] ?? entityStatus}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-1" align="start">
                  <div className="flex flex-col">
                    {ASSET_STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setEntityStatus(opt.value);
                          if (resolvedEntityType === "vehicle") {
                            updateVehicleStatus({ id: workOrder.assetId!, status: opt.value });
                          } else {
                            updateAssetStatus({ id: workOrder.assetId!, status: opt.value });
                          }
                        }}
                        className={cn(
                          "rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent",
                          entityStatus === opt.value && "bg-accent font-medium"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            }
          />
        )}
        <MetaRow
          label="Assigned To"
          value={(() => {
            const selectedIds = workOrder.assignedToIds.length > 0 ? workOrder.assignedToIds : (workOrder.assignedToId ? [workOrder.assignedToId] : []);
            const displayNames = workOrder.assignedToNames.length > 0
              ? workOrder.assignedToNames
              : (workOrder.assignedToName ? [workOrder.assignedToName] : []);
            return (
              <div className="flex flex-wrap items-center gap-1.5">
                {displayNames.map((name, i) => (
                  <span
                    key={selectedIds[i] ?? i}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-400 text-[9px] font-bold text-white">
                      {getInitials(name)}
                    </span>
                    {name}
                  </span>
                ))}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 text-[11px] text-slate-500 hover:bg-slate-50"
                    >
                      {displayNames.length === 0 ? "Assign" : "Edit"}
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="start">
                    <div className="flex max-h-48 flex-col overflow-y-auto">
                      {users.map((u) => {
                        const isChecked = selectedIds.includes(u.id);
                        return (
                          <label
                            key={u.id}
                            className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const nextIds = checked
                                  ? [...selectedIds, u.id]
                                  : selectedIds.filter((id) => id !== u.id);
                                const nextNames = checked
                                  ? [...displayNames, u.name]
                                  : displayNames.filter((_, i) => selectedIds[i] !== u.id);
                                onAssigneeChange(nextIds, nextNames);
                              }}
                            />
                            <span className="truncate">{u.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            );
          })()}
        />
        <MetaRow
          label="Category"
          value={(() => {
            const selectedCats = workOrder.categories.length > 0
              ? workOrder.categories
              : (workOrder.category ? [workOrder.category] : []);
            const enabledCats = woCategories.filter((c) => c.enabled);
            return (
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedCats.map((catId) => {
                  const cat = enabledCats.find((c) => c.id === catId);
                  return (
                    <span
                      key={catId}
                      className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                    >
                      {cat?.label ?? catId}
                    </span>
                  );
                })}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 text-[11px] text-slate-500 hover:bg-slate-50"
                    >
                      {selectedCats.length === 0 ? "Add" : "Edit"}
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="start">
                    <div className="flex max-h-48 flex-col overflow-y-auto">
                      {enabledCats.map((c) => {
                        const isChecked = selectedCats.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const nextCats = checked
                                  ? [...selectedCats, c.id]
                                  : selectedCats.filter((id) => id !== c.id);
                                onCategoryChange(nextCats);
                              }}
                            />
                            <span className="truncate">{c.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            );
          })()}
        />
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [status, setStatus] = useState<WorkOrderStatus>(workOrder.status);
  const level = useOverlayLevel();
  const { backdrop: backdropZ, panel: panelZ } = overlayZ(level);
  const { data: assets = [] } = useAssets();
  const { data: vehicles = [] } = useVehicles();
  const { data: allWorkOrders = [] } = useWorkOrders();
  const { setSelectedWorkOrderId } = useCMMSStore();
  const { mutate: deleteWO, isPending: deleting } = useDeleteWorkOrder();
  const { data: users = [] } = useUsers();
  const { data: woParts = [] } = useWOParts(workOrder.id);
  const { woCategories } = useSettingsStore();
  const { mutate: updateWO } = useUpdateWorkOrder();
  const { mutate: updateWOStatus } = useUpdateWorkOrderStatus();
  const linkedAsset =
    workOrder.assetId && workOrder.linkedEntityType !== "vehicle"
      ? (assets.find((a) => a.id === workOrder.assetId) ?? null)
      : null;
  const linkedVehicle =
    workOrder.assetId && (workOrder.linkedEntityType === "vehicle" || (!linkedAsset && workOrder.assetId))
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
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printWO(workOrder, woParts)}>
            <Download className="h-3.5 w-3.5" />
            PDF
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

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Work Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{workOrder.workOrderNumber}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
              disabled={deleting}
              onClick={() =>
                deleteWO(workOrder.id, {
                  onSuccess: () => {
                    setDeleteConfirmOpen(false);
                    setSelectedWorkOrderId(null);
                  },
                })
              }
            >
              {deleting ? "Deleting\u2026" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecordDetailTabs
        tabs={[
          {
            value: "details",
            label: "Details",
            content: (
              <DetailsTab
                workOrder={workOrder}
                status={status}
                onStatusChange={(s) => {
                  setStatus(s);
                  updateWOStatus({ id: workOrder.id, status: s, automationId: workOrder.automationId });
                }}
                onAssetClick={linkedAsset ? () => setAssetSheetOpen(true) : undefined}
                onVehicleClick={linkedVehicle ? () => setVehicleSheetOpen(true) : undefined}
                initialEntityStatus={(linkedAsset?.status ?? linkedVehicle?.status ?? "active") as AssetStatus}
                subWorkOrders={subWorkOrders}
                parentWorkOrder={parentWorkOrder}
                onSubWOClick={(id) => setSubWOSheetId(id)}
                onParentWOClick={() => setParentWOSheetOpen(true)}
                onAssigneeChange={(ids, names) => {
                  updateWO({
                    id: workOrder.id,
                    assignedToId: ids[0] ?? null,
                    assignedToName: names[0] ?? null,
                    assignedToIds: ids,
                    assignedToNames: names,
                  });
                }}
                onCategoryChange={(categories) => {
                  updateWO({
                    id: workOrder.id,
                    category: categories[0] ?? null,
                    categories,
                  });
                }}
                users={users}
                woCategories={woCategories ?? []}
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
      {assetSheetOpen && linkedAsset && createPortal(
        <OverlayLevelContext.Provider value={level + 1}>
          <div
            className="fixed inset-0"
            style={{ zIndex: backdropZ }}
            onClick={() => setAssetSheetOpen(false)}
          />
          <div
            className="pointer-events-auto fixed inset-y-0 right-0 flex w-full flex-col overflow-hidden border-l bg-background shadow-xl md:w-[720px]"
            style={{ zIndex: panelZ }}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setAssetSheetOpen(false)}
              className="absolute right-4 top-4 z-10 rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>
            <AssetDetailPanel asset={linkedAsset} />
          </div>
        </OverlayLevelContext.Provider>,
        document.body
      )}

      {/* Vehicle detail overlay */}
      {vehicleSheetOpen && linkedVehicle && createPortal(
        <OverlayLevelContext.Provider value={level + 1}>
          <div
            className="fixed inset-0"
            style={{ zIndex: backdropZ }}
            onClick={() => setVehicleSheetOpen(false)}
          />
          <div
            className="pointer-events-auto fixed inset-y-0 right-0 flex w-full flex-col overflow-hidden border-l bg-background shadow-xl md:w-[580px]"
            style={{ zIndex: panelZ }}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setVehicleSheetOpen(false)}
              className="absolute right-4 top-4 z-10 rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>
            <VehicleDetailPanel vehicle={linkedVehicle} />
          </div>
        </OverlayLevelContext.Provider>,
        document.body
      )}

      {/* Sub work order detail overlay */}
      {subWOSheetWorkOrder && createPortal(
        <OverlayLevelContext.Provider value={level + 1}>
          <div
            className="fixed inset-0"
            style={{ zIndex: backdropZ }}
            onClick={() => setSubWOSheetId(null)}
          />
          <div
            className="pointer-events-auto fixed inset-y-0 right-0 flex w-full flex-col overflow-hidden border-l bg-background shadow-xl md:w-[580px]"
            style={{ zIndex: panelZ }}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setSubWOSheetId(null)}
              className="absolute right-4 top-4 z-10 rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>
            <WorkOrderDetailPanel workOrder={subWOSheetWorkOrder} />
          </div>
        </OverlayLevelContext.Provider>,
        document.body
      )}

      {/* Parent work order detail overlay */}
      {parentWOSheetOpen && parentWorkOrder && createPortal(
        <OverlayLevelContext.Provider value={level + 1}>
          <div
            className="fixed inset-0"
            style={{ zIndex: backdropZ }}
            onClick={() => setParentWOSheetOpen(false)}
          />
          <div
            className="pointer-events-auto fixed inset-y-0 right-0 flex w-full flex-col overflow-hidden border-l bg-background shadow-xl md:w-[580px]"
            style={{ zIndex: panelZ }}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setParentWOSheetOpen(false)}
              className="absolute right-4 top-4 z-10 rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>
            <WorkOrderDetailPanel workOrder={parentWorkOrder} />
          </div>
        </OverlayLevelContext.Provider>,
        document.body
      )}

      <NewWorkOrderDialog open={editOpen} onOpenChange={setEditOpen} initialData={workOrder} />
    </div>
  );
}
