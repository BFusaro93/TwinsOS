"use client";

import { useState, useEffect } from "react";
import { Pencil, Trash2, Plus } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { RecordDetailTabs } from "@/components/shared/RecordDetailTabs";
import { CommentsSection } from "@/components/shared/CommentsSection";
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { EditButton } from "@/components/shared/EditButton";
import { StatusFlowIndicator } from "@/components/shared/StatusFlowIndicator";
import { NewProjectDialog } from "./NewProjectDialog";
import { NewRequisitionDialog } from "./NewRequisitionDialog";
import { NewPODialog } from "./NewPODialog";
import { AddProjectMaterialsDialog } from "./AddProjectMaterialsDialog";
import type { AddMaterialsDestination, AddMaterialsDraftItem } from "./AddProjectMaterialsDialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import { useRequisitions } from "@/lib/hooks/use-requisitions";
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { useDeleteProject } from "@/lib/hooks/use-projects";
import { usePOStore } from "@/stores";
import type { PrefillItem } from "./NewRequisitionDialog";
import type { POPrefillItem } from "./NewPODialog";
import type { Project, ProjectStatus } from "@/types";

interface ProjectDetailPanelProps {
  project: Project;
}

// ── Project status flow ────────────────────────────────────────────────────────
const PROJECT_FLOW_STEPS = [
  { label: "Sold" },
  { label: "Scheduled" },
  { label: "In Progress" },
  { label: "Complete" },
];

// Maps each status to a step index. On Hold stays at In Progress (index 2).
// Canceled uses index 0 with isTerminalError so the indicator shows red.
const PROJECT_STATUS_INDEX: Record<ProjectStatus, number> = {
  sold: 0,
  scheduled: 1,
  in_progress: 2,
  on_hold: 2,
  complete: 3,
  canceled: 0,
};

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

interface ProjectLineItem {
  id: string;
  sourceNumber: string;
  sourceType: "requisition" | "po" | "direct";
  productItemName: string;
  partNumber: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

function MaterialsTab({ project }: { project: Project }) {
  const { data: requisitions } = useRequisitions();
  const { data: purchaseOrders } = usePurchaseOrders();
  // Build the initial list from linked REQ / PO line items
  const persisted: ProjectLineItem[] = [];
  (requisitions ?? []).forEach((req) => {
    req.lineItems
      .filter((li) => li.projectId === project.id)
      .forEach((li) => {
        persisted.push({
          id: li.id,
          sourceNumber: req.requisitionNumber,
          sourceType: "requisition",
          productItemName: li.productItemName,
          partNumber: li.partNumber,
          quantity: li.quantity,
          unitCost: li.unitCost,
          totalCost: li.totalCost,
        });
      });
  });
  (purchaseOrders ?? []).forEach((po) => {
    po.lineItems
      .filter((li) => li.projectId === project.id)
      .forEach((li) => {
        persisted.push({
          id: li.id,
          sourceNumber: po.poNumber,
          sourceType: "po",
          productItemName: li.productItemName,
          partNumber: li.partNumber,
          quantity: li.quantity,
          unitCost: li.unitCost,
          totalCost: li.totalCost,
        });
      });
  });

  // Lift to state so edits / deletes are reflected live
  const [items, setItems] = useState<ProjectLineItem[]>([]);
  useEffect(() => { setItems(persisted); }, [requisitions, purchaseOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Edit dialog
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ quantity: "", unitCost: "" });

  const editingItem = editingId ? items.find((li) => li.id === editingId) ?? null : null;

  function openEdit(li: ProjectLineItem) {
    setEditingId(li.id);
    setEditForm({ quantity: String(li.quantity), unitCost: (li.unitCost / 100).toFixed(2) });
  }

  function saveEdit() {
    if (!editingId) return;
    const quantity = Math.max(1, parseInt(editForm.quantity, 10) || 1);
    const unitCost = Math.round(parseFloat(editForm.unitCost) * 100) || 0;
    setItems((prev) =>
      prev.map((li) =>
        li.id === editingId
          ? { ...li, quantity, unitCost: unitCost || li.unitCost, totalCost: quantity * (unitCost || li.unitCost) }
          : li
      )
    );
    setEditingId(null);
  }

  function deleteItem(id: string) {
    setItems((prev) => prev.filter((li) => li.id !== id));
  }

  // Add Materials dialog (multi-select, 2-step)
  const [addOpen, setAddOpen] = useState(false);

  // New REQ / PO dialogs (opened after destination selection)
  const [reqOpen, setReqOpen] = useState(false);
  const [reqPrefill, setReqPrefill] = useState<{ projectId: string; items: PrefillItem[] } | null>(null);
  const [poOpen, setPoOpen] = useState(false);
  const [poPrefill, setPoPrefill] = useState<{ projectId: string; items: POPrefillItem[] } | null>(null);

  function handleAddConfirm(draftItems: AddMaterialsDraftItem[], destination: AddMaterialsDestination) {
    const toProjectItems = (src: AddMaterialsDraftItem[], sourceNumber: string, sourceType: ProjectLineItem["sourceType"]): ProjectLineItem[] =>
      src.map((i) => ({
        id: `${sourceType}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sourceNumber,
        sourceType,
        productItemName: i.productName,
        partNumber: i.partNumber,
        quantity: i.quantity,
        unitCost: Math.round(i.unitCost * 100),
        totalCost: Math.round(i.quantity * i.unitCost * 100),
      }));

    if (destination.type === "direct") {
      setItems((prev) => [...prev, ...toProjectItems(draftItems, "Direct", "direct")]);
    } else if (destination.type === "existing_req") {
      setItems((prev) => [...prev, ...toProjectItems(draftItems, destination.reqNumber, "requisition")]);
    } else if (destination.type === "existing_po") {
      setItems((prev) => [...prev, ...toProjectItems(draftItems, destination.poNumber, "po")]);
    } else if (destination.type === "new_req") {
      setReqPrefill({
        projectId: project.id,
        items: draftItems.map((i) => ({ productKey: i.productKey, productName: i.productName, partNumber: i.partNumber, unitCost: i.unitCost, quantity: i.quantity })),
      });
      setReqOpen(true);
    } else if (destination.type === "new_po") {
      setPoPrefill({
        projectId: project.id,
        items: draftItems.map((i) => ({ productKey: i.productKey, productName: i.productName, partNumber: i.partNumber, unitCost: i.unitCost, quantity: i.quantity })),
      });
      setPoOpen(true);
    }
  }

  const total = items.reduce((sum, li) => sum + li.quantity * li.unitCost, 0);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Materials</p>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" />
          Add Material
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-400">No line items linked to this project yet.</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 text-xs">
                  <TableHead>Item</TableHead>
                  <TableHead>Part #</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((li) => (
                  <TableRow key={li.id} className="group text-sm">
                    <TableCell className="font-medium">{li.productItemName}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{li.partNumber}</TableCell>
                    <TableCell className="text-right">{li.quantity}</TableCell>
                    <TableCell className="text-right text-slate-600">{formatCurrency(li.unitCost)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(li.quantity * li.unitCost)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          li.sourceType === "po"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : li.sourceType === "direct"
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }
                      >
                        {li.sourceNumber}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-2 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => openEdit(li)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteItem(li.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <div className="flex justify-between font-semibold text-slate-900">
              <span>Materials Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </>
      )}

      <AddProjectMaterialsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onConfirm={handleAddConfirm}
      />

      <NewRequisitionDialog open={reqOpen} onOpenChange={setReqOpen} prefillData={reqPrefill} />
      <NewPODialog open={poOpen} onOpenChange={setPoOpen} prefillData={poPrefill} />

      {/* Edit dialog */}
      <Dialog open={!!editingItem} onOpenChange={(o) => { if (!o) setEditingId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Line Item</DialogTitle>
            <DialogDescription>
              {editingItem?.productItemName}
              {editingItem?.partNumber ? ` — ${editingItem.partNumber}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Quantity</label>
                <Input type="number" min={1} value={editForm.quantity} onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))} autoFocus />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Unit Cost ($)</label>
                <Input type="number" min={0} step={0.01} value={editForm.unitCost} onChange={(e) => setEditForm((f) => ({ ...f, unitCost: e.target.value }))} />
              </div>
            </div>
            <Button onClick={saveEdit} className="mt-1">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailsTab({
  project,
  status,
  onStatusChange,
}: {
  project: Project;
  status: ProjectStatus;
  onStatusChange: (s: ProjectStatus) => void;
}) {
  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Status flow */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Status
        </p>
        <StatusFlowIndicator
          steps={PROJECT_FLOW_STEPS}
          currentIndex={PROJECT_STATUS_INDEX[status]}
          isTerminalError={status === "canceled"}
        />
        {/* Action strip */}
        <div className="mt-3 flex flex-wrap gap-2">
          {status === "sold" && (<>
            <Button size="sm" onClick={() => onStatusChange("scheduled")}>Mark Scheduled</Button>
            <Button size="sm" variant="outline" onClick={() => onStatusChange("canceled")}>Cancel Project</Button>
          </>)}
          {status === "scheduled" && (<>
            <Button size="sm" onClick={() => onStatusChange("in_progress")}>Start Project</Button>
            <Button size="sm" variant="outline" onClick={() => onStatusChange("on_hold")}>Put On Hold</Button>
            <Button size="sm" variant="outline" onClick={() => onStatusChange("canceled")}>Cancel</Button>
          </>)}
          {status === "in_progress" && (<>
            <Button size="sm" onClick={() => onStatusChange("complete")}>Mark Complete</Button>
            <Button size="sm" variant="outline" onClick={() => onStatusChange("on_hold")}>Put On Hold</Button>
            <Button size="sm" variant="outline" onClick={() => onStatusChange("canceled")}>Cancel</Button>
          </>)}
          {status === "on_hold" && (<>
            <Button size="sm" onClick={() => onStatusChange("in_progress")}>Resume Project</Button>
            <Button size="sm" variant="outline" onClick={() => onStatusChange("canceled")}>Cancel</Button>
          </>)}
          {status === "complete" && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange("in_progress")}>Reopen</Button>
          )}
          {status === "canceled" && (
            <Button size="sm" variant="outline" onClick={() => onStatusChange("sold")}>Reopen</Button>
          )}
        </div>
      </div>

      <Separator />

      <dl>
        <MetaRow label="Customer" value={project.customerName} />
        <MetaRow
          label="Status"
          value={
            <StatusBadge
              variant={status === "on_hold" ? "on_hold_project" : status}
              label={PROJECT_STATUS_LABELS[status]}
            />
          }
        />
        <MetaRow label="Address" value={project.address} />
        <MetaRow label="Start Date" value={formatDate(project.startDate)} />
        <MetaRow
          label="End Date"
          value={project.endDate ? formatDate(project.endDate) : "TBD"}
        />
        <MetaRow label="Total Cost" value={formatCurrency(project.totalCost)} />
        {project.notes && <MetaRow label="Notes" value={project.notes} />}
      </dl>
    </div>
  );
}

function HistoryTab({ project }: { project: Project }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Comments
        </p>
        <CommentsSection recordType="project" recordId={project.id} />
      </div>
      <Separator className="mb-6" />
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Audit Trail
      </p>
      <AuditTrailTab recordType="project" recordId={project.id} />
    </div>
  );
}

function FilesTab({ project }: { project: Project }) {
  return (
    <div className="p-6">
      <AttachmentsSection recordType="project" recordId={project.id} />
    </div>
  );
}

export function ProjectDetailPanel({ project }: ProjectDetailPanelProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const { setSelectedProjectId } = usePOStore();
  const { mutate: deleteProject, isPending: deleting } = useDeleteProject();

  // Sync if a different project is selected
  useEffect(() => {
    setStatus(project.status);
  }, [project.id, project.status]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between border-b px-6 py-4 pr-12">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{project.name}</h2>
          <p className="text-sm text-slate-500">{project.customerName}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            variant={status === "on_hold" ? "on_hold_project" : status}
            label={PROJECT_STATUS_LABELS[status]}
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
            content: <DetailsTab project={project} status={status} onStatusChange={setStatus} />,
          },
          {
            value: "materials",
            label: "Materials",
            content: <MaterialsTab project={project} />,
          },
          {
            value: "history",
            label: "Comments & History",
            content: <HistoryTab project={project} />,
          },
          {
            value: "files",
            label: "Files",
            content: <FilesTab project={project} />,
          },
        ]}
      />
      <NewProjectDialog open={editOpen} onOpenChange={setEditOpen} initialData={project} />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{project.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
              disabled={deleting}
              onClick={() =>
                deleteProject(project.id, {
                  onSuccess: () => {
                    setDeleteConfirmOpen(false);
                    setSelectedProjectId(null);
                  },
                })
              }
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
