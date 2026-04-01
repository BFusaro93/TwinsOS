"use client";

import { useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { RecordDetailTabs } from "@/components/shared/RecordDetailTabs";
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
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
import { EditButton } from "@/components/shared/EditButton";
import { StatusFlowIndicator } from "@/components/shared/StatusFlowIndicator";
import { NewRequestDialog } from "./NewRequestDialog";
import { REQUEST_STATUS_LABELS, WO_PRIORITY_LABELS } from "@/lib/constants";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useUpdateRequestStatus, useDeleteRequest, useConvertRequestToWO } from "@/lib/hooks/use-requests";
import { useCreateWorkOrder, useWorkOrders } from "@/lib/hooks/use-work-orders";
import { useVehicles } from "@/lib/hooks/use-vehicles";
import { useCMMSStore } from "@/stores";
import { WorkOrderDetailPanel } from "./WorkOrderDetailPanel";
import type { MaintenanceRequest, MaintenanceRequestStatus } from "@/types";

interface RequestDetailPanelProps {
  request: MaintenanceRequest;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

const REQUEST_FLOW_STEPS = [
  { label: "Submitted" },
  { label: "In Review" },
  { label: "Approved" },
  { label: "Converted" },
];

const REQUEST_STATUS_INDEX: Record<string, number> = {
  open: 0,
  in_review: 1,
  approved: 2,
  converted: 3,
  rejected: 1,
};

function DetailsTab({
  request,
  status,
  onStatusChange,
  onConvertToWO,
  converting,
  onOpenWoSheet,
}: {
  request: MaintenanceRequest;
  status: MaintenanceRequestStatus;
  onStatusChange: (s: MaintenanceRequestStatus) => void;
  onConvertToWO: () => void;
  converting: boolean;
  onOpenWoSheet: () => void;
}) {
  const isError = status === "rejected";

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Status
        </p>
        <StatusFlowIndicator
          steps={REQUEST_FLOW_STEPS}
          currentIndex={REQUEST_STATUS_INDEX[status] ?? 0}
          isTerminalError={isError}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {status === "open" && (
            <Button size="sm" onClick={() => onStatusChange("in_review")}>Begin Review</Button>
          )}
          {status === "in_review" && (<>
            <Button size="sm" onClick={() => onStatusChange("approved")}>Approve</Button>
            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300" onClick={() => onStatusChange("rejected")}>Reject</Button>
          </>)}
          {status === "approved" && (<>
            <Button size="sm" onClick={onConvertToWO} disabled={converting}>
              {converting ? "Creating…" : "Convert to Work Order"}
            </Button>
            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300" onClick={() => onStatusChange("rejected")}>Reject</Button>
          </>)}
          {status === "rejected" && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange("open")}>Reopen</Button>
          )}
          {status === "converted" && (
            <p className="text-xs text-slate-400 mt-1">This request has been converted to a work order.</p>
          )}
        </div>
      </div>

      <Separator />

      <dl>
        <MetaRow
          label="Status"
          value={
            <StatusBadge
              variant={status}
              label={REQUEST_STATUS_LABELS[status]}
            />
          }
        />
        <MetaRow
          label="Priority"
          value={
            <StatusBadge
              variant={request.priority}
              label={WO_PRIORITY_LABELS[request.priority]}
            />
          }
        />
        <MetaRow label="Submitted By" value={request.requestedByName} />
        <MetaRow label="Asset" value={request.assetName} />
        <MetaRow label="Submitted" value={formatDate(request.createdAt)} />
        {request.linkedWorkOrderNumber && (
          <MetaRow
            label="Work Order"
            value={
              <button
                type="button"
                onClick={() => onOpenWoSheet()}
                className="inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                {request.linkedWorkOrderNumber}
              </button>
            }
          />
        )}
      </dl>

      {request.description && (
        <>
          <Separator />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Description
            </p>
            <p className="text-sm text-slate-700">{request.description}</p>
          </div>
        </>
      )}
    </div>
  );
}

function HistoryTab({ request }: { request: MaintenanceRequest }) {
  return <AuditTrailTab recordType="request" recordId={request.id} />;
}

function FilesTab({ request }: { request: MaintenanceRequest }) {
  return (
    <div className="p-6">
      <AttachmentsSection recordType="request" recordId={request.id} />
    </div>
  );
}

export function RequestDetailPanel({ request }: RequestDetailPanelProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [woSheetOpen, setWoSheetOpen] = useState(false);
  const [status, setStatus] = useState<MaintenanceRequestStatus>(request.status);
  const { data: workOrders = [] } = useWorkOrders();
  const { data: vehicles = [] } = useVehicles();
  const linkedWO = request.linkedWorkOrderId
    ? workOrders.find((wo) => wo.id === request.linkedWorkOrderId) ?? null
    : null;
  const { mutate: syncStatus } = useUpdateRequestStatus();
  const { mutate: deleteRequest, isPending: deleting } = useDeleteRequest();
  const { mutate: createWorkOrder, isPending: converting } = useCreateWorkOrder();
  const { mutate: convertToWO } = useConvertRequestToWO();
  const { setSelectedRequestId } = useCMMSStore();

  function handleStatusChange(s: MaintenanceRequestStatus) {
    setStatus(s);
    syncStatus({ id: request.id, status: s });
  }

  function handleConvertToWO() {
    const workOrderNumber = `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
    createWorkOrder(
      {
        title: request.title,
        description: request.description ?? null,
        status: "open",
        priority: request.priority,
        woType: "reactive",
        assetId: request.assetId ?? null,
        assetName: request.assetName ?? null,
        linkedEntityType: request.assetId
          ? (vehicles.some((v) => v.id === request.assetId) ? "vehicle" : "asset")
          : null,
        assignedToId: null,
        assignedToName: null,
        assignedToIds: [],
        assignedToNames: [],
        dueDate: null,
        category: null,
        categories: [],
        workOrderNumber,
        parentWorkOrderId: null,
        pmScheduleId: null,
        isRecurring: false,
        recurrenceFrequency: null,
        automationId: null,
      },
      {
        onSuccess: (wo) => {
          setStatus("converted");
          convertToWO({
            id: request.id,
            linkedWorkOrderId: wo.id,
            linkedWorkOrderNumber: wo.workOrderNumber,
          });
        },
      }
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4 pr-12">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {request.requestNumber}
          </h2>
          <p className="text-sm text-slate-500">{request.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            variant={status}
            label={REQUEST_STATUS_LABELS[status]}
          />
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

      <RecordDetailTabs
        tabs={[
          {
            value: "details",
            label: "Details",
            content: <DetailsTab request={request} status={status} onStatusChange={handleStatusChange} onConvertToWO={handleConvertToWO} converting={converting} onOpenWoSheet={() => setWoSheetOpen(true)} />,
          },
          {
            value: "history",
            label: "History",
            content: <HistoryTab request={request} />,
          },
          {
            value: "files",
            label: "Files",
            content: <FilesTab request={request} />,
          },
        ]}
      />
      <NewRequestDialog open={editOpen} onOpenChange={setEditOpen} initialData={request} />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete request <strong>{request.requestNumber}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
              disabled={deleting}
              onClick={() =>
                deleteRequest(request.id, {
                  onSuccess: () => {
                    setDeleteConfirmOpen(false);
                    setSelectedRequestId(null);
                  },
                })
              }
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={woSheetOpen && !!linkedWO} onOpenChange={(o) => { if (!o) setWoSheetOpen(false); }}>
        <SheetContent className="flex w-full flex-col overflow-hidden p-0 md:w-[580px] md:max-w-[580px]">
          <SheetHeader className="sr-only">
            <SheetTitle>{linkedWO?.workOrderNumber}</SheetTitle>
          </SheetHeader>
          {linkedWO && <WorkOrderDetailPanel workOrder={linkedWO} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
