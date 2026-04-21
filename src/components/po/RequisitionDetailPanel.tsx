"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, ExternalLink, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { RecordDetailTabs } from "@/components/shared/RecordDetailTabs";
import { ApprovalFlowIndicator } from "@/components/shared/ApprovalFlowIndicator";
import { ApprovalChain } from "@/components/shared/ApprovalChain";
import { CommentsSection } from "@/components/shared/CommentsSection";
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { LineItemsTable } from "./LineItemsTable";
import { EditButton } from "@/components/shared/EditButton";
import { NewRequisitionDialog } from "./NewRequisitionDialog";
import { NewPODialog } from "./NewPODialog";
import { SplitToPOsDialog } from "./SplitToPOsDialog";
import { PODetailSheet } from "./PODetailSheet";
import { ProductDetailSheet } from "./ProductDetailSheet";
import { ProjectDetailSheet } from "./ProjectDetailSheet";
import { PartDetailSheet } from "@/components/cmms/PartDetailSheet";
import { CatalogItemCombobox } from "@/components/shared/CatalogItemCombobox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APPROVAL_STATUS_LABELS } from "@/lib/constants";
import { useProducts } from "@/lib/hooks/use-products";
import { useParts } from "@/lib/hooks/use-parts";
import { useProjects } from "@/lib/hooks/use-projects";
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { useSubmitForApproval } from "@/lib/hooks/use-approval-requests";
import { useUpdateRequisitionStatus, useAddRequisitionLineItem, useDeleteRequisition } from "@/lib/hooks/use-requisitions";
import { useCurrentUserStore } from "@/stores";
import type { Requisition, LineItem, ApprovalStatus, PurchaseOrder } from "@/types";

interface RequisitionDetailPanelProps {
  requisition: Requisition;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

function DetailsTab({
  req,
  status,
  onStatusChange,
  onConvertToPO,
  onSplitToPOs,
  convertedPoIds,
  convertedPOs,
  onPoClick,
  onProductClick,
  onPartClick,
  onProjectClick,
}: {
  req: Requisition;
  status: ApprovalStatus;
  onStatusChange: (s: ApprovalStatus) => void;
  onConvertToPO: () => void;
  onSplitToPOs?: () => void;
  convertedPoIds: string[];
  convertedPOs: PurchaseOrder[];
  onPoClick: () => void;
  onProductClick?: (productId: string) => void;
  onPartClick?: (partId: string) => void;
  onProjectClick?: (projectId: string) => void;
}) {
  const [lineItems, setLineItems] = useState<LineItem[]>(req.lineItems);
  const [addOpen, setAddOpen] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [addCost, setAddCost] = useState("");
  const [addProjectId, setAddProjectId] = useState("none");

  const { currentUser } = useCurrentUserStore();
  const canSubmit = status === "draft" && (currentUser.role === "admin" || currentUser.role === "manager" || currentUser.role === "purchaser" || req.createdBy === currentUser.id);

  const { mutate: submitForApproval, isPending: submitting } = useSubmitForApproval();
  const { mutate: syncStatus } = useUpdateRequisitionStatus();
  const { mutate: persistLineItem, isPending: addingItem } = useAddRequisitionLineItem();

  // Write status change to shared store so the list panel stays in sync
  function handleStatusChange(s: ApprovalStatus) {
    onStatusChange(s);
    syncStatus({ id: req.id, status: s });
  }

  const { data: products = [] } = useProducts();
  const { data: parts = [] } = useParts();
  const { data: addProjects = [] } = useProjects();

  const catalog = [
    ...products.map((p) => ({ key: `product:${p.id}`, name: p.name, partNumber: p.partNumber, unitCost: p.unitCost, type: "product" as const })),
    ...parts.map((p) => ({ key: `part:${p.id}`, name: p.name, partNumber: p.partNumber, unitCost: p.unitCost, type: "part" as const })),
  ];

  function handleAddLineItem() {
    const selected = catalog.find((c) => c.key === addValue);
    if (!selected) return;
    const qty = Math.max(1, parseInt(addQty) || 1);
    const costCents = addCost ? Math.round(parseFloat(addCost) * 100) : selected.unitCost;
    const rawId = selected.key.replace(/^(product:|part:)/, "");
    const productItemId = selected.type === "part" ? "" : rawId;
    const partId = selected.type === "part" ? rawId : null;
    const newLineItem = {
      productItemId,
      partId,
      productItemName: selected.name,
      partNumber: selected.partNumber ?? "",
      quantity: qty,
      unitCost: costCents,
      totalCost: qty * costCents,
      projectId: addProjectId === "none" ? null : addProjectId,
      notes: null,
      taxable: true,
    };
    const newSubtotal = lineItems.reduce((s, li) => s + li.quantity * li.unitCost, 0) + qty * costCents;
    const newSalesTax = Math.round((newSubtotal * req.taxRatePercent) / 100);
    const newGrandTotal = newSubtotal + newSalesTax + req.shippingCost;
    persistLineItem(
      { requisitionId: req.id, lineItem: newLineItem, newSubtotal, newSalesTax, newGrandTotal },
      {
        onSuccess: () => {
          // Optimistically update local state (the query invalidation will sync on next fetch)
          setLineItems((prev) => [...prev, { id: `li-${Date.now()}`, ...newLineItem }]);
          setAddOpen(false);
          setAddValue("");
          setAddQty("1");
          setAddCost("");
          setAddProjectId("none");
        },
      }
    );
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitCost, 0);
  const salesTax = Math.round((subtotal * req.taxRatePercent) / 100);
  const grandTotal = subtotal + salesTax + req.shippingCost;
  const taxLabel = req.taxRatePercent > 0 ? `Sales Tax (${req.taxRatePercent}%)` : "Sales Tax";

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Approval Status
        </p>
        <ApprovalFlowIndicator currentStatus={status} />

        {/* Draft → submit for approval */}
        {status === "draft" && canSubmit && (
          <div className="mt-3">
            <Button
              size="sm"
              disabled={submitting}
              onClick={() => {
                submitForApproval(
                  { entityId: req.id, entityType: "requisition", grandTotalCents: grandTotal },
                  // The hook updates the DB status — only update local state here
                  { onSuccess: () => onStatusChange("pending_approval") }
                );
              }}
            >
              {submitting ? "Submitting…" : "Submit for Approval"}
            </Button>
          </div>
        )}

        {/* Approval chain (shown once in pending / approved / rejected) */}
        {status !== "draft" && status !== "ordered" && status !== "closed" && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-slate-500">Approval Chain</p>
            <ApprovalChain
              entityId={req.id}
              // The hook writes the DB status; only update local state here
              onApproved={() => onStatusChange("approved")}
              onRejected={() => onStatusChange("rejected")}
            />
          </div>
        )}

        {/* Post-approval actions */}
        <div className="mt-3 flex flex-wrap gap-2">
          {status === "rejected" && (
            <Button size="sm" variant="outline" onClick={() => handleStatusChange("draft")}>
              Reset to Draft
            </Button>
          )}
          {status === "approved" && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onConvertToPO()}>
                Convert to Purchase Order
              </Button>
              <Button size="sm" variant="outline" onClick={() => onSplitToPOs?.()}>
                Split by Vendor
              </Button>
            </div>
          )}
        </div>
      </div>

      <Separator />

      <dl>
        <MetaRow label="Requested By" value={req.requestedByName} />
        <MetaRow label="Vendor" value={req.vendorName} />
        {convertedPoIds.length > 0 && (
          <MetaRow
            label="Purchase Order"
            value={
              <div className="flex flex-wrap gap-1">
                {convertedPOs.map((po) => (
                  <button
                    key={po.id}
                    type="button"
                    onClick={onPoClick}
                    className="inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {po.poNumber}
                  </button>
                ))}
              </div>
            }
          />
        )}
        <MetaRow
          label="Status"
          value={<StatusBadge variant={status} label={APPROVAL_STATUS_LABELS[status]} />}
        />
        {req.workOrderId && (
          <MetaRow
            label="Work Order"
            value={
              <Badge variant="outline" className="border-brand-200 bg-brand-50 text-brand-700">
                {req.workOrderId}
              </Badge>
            }
          />
        )}
        <MetaRow label="Created" value={formatDate(req.createdAt)} />
        <MetaRow label="Updated" value={formatDate(req.updatedAt)} />
        {req.notes && <MetaRow label="Notes" value={req.notes} />}
      </dl>

      <Separator />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Line Items
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddOpen(true)}
            className="h-7 gap-1 text-xs"
          >
            <Plus className="h-3 w-3" />
            Add Line Item
          </Button>
        </div>
        <LineItemsTable
          lineItems={lineItems}
          showProject
          editable
          onItemsChange={setLineItems}
          onProductClick={onProductClick}
          onPartClick={onPartClick}
          onProjectClick={onProjectClick}
        />
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Line Item</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Item *</label>
              <CatalogItemCombobox
                products={products}
                parts={parts}
                value={addValue}
                onValueChange={(val) => {
                  setAddValue(val);
                  const found = catalog.find((c) => c.key === val);
                  if (found) setAddCost((found.unitCost / 100).toFixed(2));
                }}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Quantity</label>
                <Input
                  type="number"
                  min={1}
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Unit Cost ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="0.00"
                  value={addCost}
                  onChange={(e) => setAddCost(e.target.value)}
                />
              </div>
            </div>
            {addValue.startsWith("product:") && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Project</label>
                <Select value={addProjectId} onValueChange={setAddProjectId}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="No project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project</SelectItem>
                    {addProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleAddLineItem} disabled={!addValue || addingItem} className="mt-1">
              {addingItem ? "Adding..." : "Add Line Item"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-md bg-slate-50 p-3 text-sm">
        <div className="flex justify-between py-1 text-slate-600">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between py-1 text-slate-600">
          <span>{taxLabel}</span>
          <span>{formatCurrency(salesTax)}</span>
        </div>
        {req.shippingCost > 0 && (
          <div className="flex justify-between py-1 text-slate-600">
            <span>Shipping / Other</span>
            <span>{formatCurrency(req.shippingCost)}</span>
          </div>
        )}
        <Separator className="my-1" />
        <div className="flex justify-between py-1 font-semibold text-slate-900">
          <span>Grand Total</span>
          <span>{formatCurrency(grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ req }: { req: Requisition }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Comments
        </p>
        <CommentsSection recordType="requisition" recordId={req.id} />
      </div>

      <Separator className="mb-6" />

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Audit Trail
      </p>
      <AuditTrailTab recordType="requisition" recordId={req.id} />
    </div>
  );
}

function FilesTab({ req }: { req: Requisition }) {
  return (
    <div className="p-6">
      <AttachmentsSection recordType="requisition" recordId={req.id} />
    </div>
  );
}

export function RequisitionDetailPanel({ requisition }: RequisitionDetailPanelProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [poSheetOpen, setPoSheetOpen] = useState(false);
  const [status, setStatus] = useState<ApprovalStatus>(requisition.status);

  // Keep local status in sync when the requisition is refetched from the server
  // (e.g. after another user approves, or after navigating away and back)
  useEffect(() => {
    setStatus(requisition.status);
  }, [requisition.status]);
  const [convertedPoIds, setConvertedPoIds] = useState<string[]>(
    requisition.convertedPoId ? [requisition.convertedPoId] : []
  );
  const [splitOpen, setSplitOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { mutate: syncStatus } = useUpdateRequisitionStatus();
  const { mutate: deleteReq, isPending: deleting } = useDeleteRequisition();

  const { data: products = [] } = useProducts();
  const { data: allParts = [] } = useParts();
  const { data: projects = [] } = useProjects();
  const { data: allPOs = [] } = usePurchaseOrders();

  const convertedPOs: PurchaseOrder[] = allPOs.filter((po) =>
    convertedPoIds.includes(po.id)
  );
  const convertedPO: PurchaseOrder | null = convertedPOs[0] ?? null;

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;
  const selectedPart = allParts.find((p) => p.id === selectedPartId) ?? null;
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  // Build prefill data from the requisition for the PO dialog.
  // Memoized so the NewPODialog prefill useEffect only fires when the
  // requisition data actually changes (not on every parent re-render).
  const poPrefill = useMemo(() => ({
    vendorId: requisition.vendorId ?? undefined,
    requisitionId: requisition.id,
    items: requisition.lineItems.map((li) => {
      // Resolve the combobox key: "product:<id>" or "part:<id>"
      // Priority: already-prefixed > partId (maintenance part) > productItemId (catalog item)
      let productKey: string;
      if (li.productItemId.startsWith("product:") || li.productItemId.startsWith("part:")) {
        productKey = li.productItemId;
      } else if (li.partId) {
        productKey = `part:${li.partId}`;
      } else if (li.productItemId) {
        productKey = `product:${li.productItemId}`;
      } else {
        productKey = "";
      }
      return {
        productKey,
        productName: li.productItemName,
        partNumber: li.partNumber ?? "",
        unitCost: li.unitCost / 100,
        quantity: li.quantity,
        projectId: li.projectId ?? null,
      };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [requisition.id, requisition.vendorId, requisition.lineItems]);

  function handleConverted(po: PurchaseOrder) {
    const newStatus: ApprovalStatus = "ordered";
    setStatus(newStatus);
    setConvertedPoIds((prev) => [...prev, po.id]);
    syncStatus({ id: requisition.id, status: newStatus, convertedPoId: po.id });
  }

  function handleSplitConverted(pos: PurchaseOrder[]) {
    const newStatus: ApprovalStatus = "ordered";
    setStatus(newStatus);
    setConvertedPoIds(pos.map((p) => p.id));
    if (pos[0]) syncStatus({ id: requisition.id, status: newStatus, convertedPoId: pos[0].id });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4 pr-12">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {requisition.requisitionNumber}
          </h2>
          <p className="text-sm text-slate-500">{requisition.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge variant={status} label={APPROVAL_STATUS_LABELS[status]} />
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
            <AlertDialogTitle>Delete Requisition</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{requisition.requisitionNumber}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
              disabled={deleting}
              onClick={() =>
                deleteReq(requisition.id, {
                  onSuccess: () => setDeleteConfirmOpen(false),
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
                req={requisition}
                status={status}
                onStatusChange={setStatus}
                onConvertToPO={() => setConvertOpen(true)}
                onSplitToPOs={() => setSplitOpen(true)}
                convertedPoIds={convertedPoIds}
                convertedPOs={convertedPOs}
                onPoClick={() => setPoSheetOpen(true)}
                onProductClick={(id) => setSelectedProductId(id)}
                onPartClick={(id) => setSelectedPartId(id)}
                onProjectClick={(id) => setSelectedProjectId(id)}
              />
            ),
          },
          {
            value: "history",
            label: "Comments & History",
            content: <HistoryTab req={requisition} />,
          },
          {
            value: "files",
            label: "Files",
            content: <FilesTab req={requisition} />,
          },
        ]}
      />

      <NewRequisitionDialog open={editOpen} onOpenChange={setEditOpen} initialData={requisition} />
      <NewPODialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        prefillData={poPrefill}
        onCreated={(po) => handleConverted(po)}
      />
      <SplitToPOsDialog
        open={splitOpen}
        onOpenChange={setSplitOpen}
        requisition={requisition}
        onCreated={handleSplitConverted}
      />
      <PODetailSheet
        po={convertedPO}
        open={poSheetOpen}
        onOpenChange={setPoSheetOpen}
      />
      <ProductDetailSheet
        open={!!selectedProduct}
        onOpenChange={(o) => {
          if (!o) setSelectedProductId(null);
        }}
        product={selectedProduct}
      />
      <PartDetailSheet
        part={selectedPart}
        open={!!selectedPart}
        onOpenChange={(o) => {
          if (!o) setSelectedPartId(null);
        }}
      />
      <ProjectDetailSheet
        open={!!selectedProject}
        onOpenChange={(o) => {
          if (!o) setSelectedProjectId(null);
        }}
        project={selectedProject}
      />
    </div>
  );
}
