"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, ExternalLink, Download, Building2 } from "lucide-react";
import { printProject } from "@/lib/print";
import { formatCurrency, formatDate, formatAddress } from "@/lib/utils";
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
import { useDeleteProject, useUpdateProject, useArchiveProject } from "@/lib/hooks/use-projects";
import {
  useProjectDirectItems,
  useAddProjectDirectItem,
  useUpdateProjectDirectItem,
  useDeleteProjectDirectItem,
} from "@/lib/hooks/use-project-direct-items";
import {
  useProjectSubcontractCosts,
  useCreateProjectSubcontractCost,
  useUpdateProjectSubcontractCost,
  useDeleteProjectSubcontractCost,
} from "@/lib/hooks/use-project-subcontract-costs";
import { useVendors } from "@/lib/hooks/use-vendors";
import { usePOStore } from "@/stores";
import type { PrefillItem } from "./NewRequisitionDialog";
import type { POPrefillItem } from "./NewPODialog";
import { PODetailSheet } from "./PODetailSheet";
import { ProductDetailSheet } from "./ProductDetailSheet";
import { RequisitionDetailPanel } from "./RequisitionDetailPanel";
import { useProducts } from "@/lib/hooks/use-products";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Project, ProjectStatus, Requisition, PurchaseOrder, ProjectSubcontractCost, SubcontractCostType } from "@/types";

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
  sourceId: string;
  sourceNumber: string;
  sourceType: "requisition" | "po" | "direct";
  productItemId: string;
  productItemName: string;
  partNumber: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  /** Mirrors po_line_items.taxable — false for items like pallet deposits or delivery. Defaults to true for REQ line items and direct adds. */
  taxable: boolean;
}

function MaterialsTab({ project }: { project: Project }) {
  const { data: requisitions } = useRequisitions();
  const { data: purchaseOrders } = usePurchaseOrders();
  const { data: products = [] } = useProducts();
  const { data: directItems = [] } = useProjectDirectItems(project.id);
  const { mutate: addDirectItem } = useAddProjectDirectItem();
  const { mutate: updateDirectItem } = useUpdateProjectDirectItem();
  const { mutate: deleteDirectItem } = useDeleteProjectDirectItem();

  // Build the initial list from linked REQ / PO line items.
  // Skip requisitions that have been converted to a PO (status "ordered"
  // with a convertedPoId) to avoid showing duplicate materials.
  // Live name lookup: product_item_name on line items is a snapshot from creation time.
  // Use the current catalog name when available so renames are reflected immediately.
  const productNameById = new Map(products.map((p) => [p.id, p.name]));
  const resolveName = (productItemId: string | null, fallback: string) =>
    (productItemId && productNameById.get(productItemId)) || fallback;

  // REQ + PO line items (from linked documents)
  const linkedItems: ProjectLineItem[] = [];
  (requisitions ?? []).forEach((req) => {
    if (req.convertedPoId && req.status === "ordered") return;
    req.lineItems
      .filter((li) => li.projectId === project.id)
      .forEach((li) => {
        linkedItems.push({
          id: li.id,
          sourceId: req.id,
          sourceNumber: req.requisitionNumber,
          sourceType: "requisition",
          productItemId: li.productItemId ?? "",
          productItemName: resolveName(li.productItemId, li.productItemName),
          partNumber: li.partNumber,
          quantity: li.quantity,
          unitCost: li.unitCost,
          totalCost: li.totalCost,
          taxable: true,
        });
      });
  });
  (purchaseOrders ?? []).forEach((po) => {
    po.lineItems
      .filter((li) => li.projectId === project.id)
      .forEach((li) => {
        linkedItems.push({
          id: li.id,
          sourceId: po.id,
          sourceNumber: po.poNumber,
          sourceType: "po",
          productItemId: li.productItemId ?? "",
          productItemName: resolveName(li.productItemId, li.productItemName),
          partNumber: li.partNumber,
          quantity: li.quantity,
          unitCost: li.unitCost,
          totalCost: li.totalCost,
          taxable: li.taxable !== false,
        });
      });
  });

  // Direct items come from DB — merge after linked items
  const directProjectItems: ProjectLineItem[] = directItems.map((di) => ({
    id: di.id,
    sourceId: di.id,
    sourceNumber: "Direct",
    sourceType: "direct" as const,
    productItemId: di.productItemId ?? "",
    productItemName: resolveName(di.productItemId, di.productItemName),
    partNumber: di.partNumber,
    quantity: di.quantity,
    unitCost: di.unitCost,
    totalCost: di.quantity * di.unitCost,
    taxable: false, // direct items are not taxed (no vendor tax rate)
  }));

  const items: ProjectLineItem[] = [...linkedItems, ...directProjectItems];

  // Edit dialog
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ quantity: "", unitCost: "" });

  const editingItem = editingId ? items.find((li) => li.id === editingId) ?? null : null;

  function openEdit(li: ProjectLineItem) {
    setEditingId(li.id);
    setEditForm({ quantity: String(li.quantity), unitCost: (li.unitCost / 100).toFixed(2) });
  }

  function saveEdit() {
    if (!editingId || !editingItem) return;
    const quantity = Math.max(0.01, parseFloat(editForm.quantity) || 0.01);
    const unitCost = Math.round(parseFloat(editForm.unitCost) * 100) || editingItem.unitCost;
    if (editingItem.sourceType === "direct") {
      updateDirectItem({ id: editingId, projectId: project.id, quantity, unitCost });
    }
    // REQ / PO line items: local-only preview (full edit happens via the source document)
    setEditingId(null);
  }

  function deleteItem(li: ProjectLineItem) {
    if (li.sourceType === "direct") {
      deleteDirectItem({ id: li.id, projectId: project.id });
    }
    // REQ / PO line items: removing from project scope must be done via the source document
  }

  // Source / Product overlay state
  const [selectedSourceItem, setSelectedSourceItem] = useState<ProjectLineItem | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const selectedProduct = selectedProductId
    ? products.find((p) => p.id === selectedProductId) ?? null
    : null;

  const selectedRequisition = selectedSourceItem?.sourceType === "requisition"
    ? (requisitions ?? []).find((r) => r.id === selectedSourceItem.sourceId) ?? null
    : null;
  const selectedPO = selectedSourceItem?.sourceType === "po"
    ? (purchaseOrders ?? []).find((po) => po.id === selectedSourceItem.sourceId) ?? null
    : null;

  // Add Materials dialog (multi-select, 2-step)
  const [addOpen, setAddOpen] = useState(false);

  // New REQ / PO dialogs (opened after destination selection)
  const [reqOpen, setReqOpen] = useState(false);
  const [reqPrefill, setReqPrefill] = useState<{ projectId: string; items: PrefillItem[] } | null>(null);
  const [poOpen, setPoOpen] = useState(false);
  const [poPrefill, setPoPrefill] = useState<{ projectId: string; items: POPrefillItem[] } | null>(null);

  function handleAddConfirm(draftItems: AddMaterialsDraftItem[], destination: AddMaterialsDestination) {
    const toProjectItems = (src: AddMaterialsDraftItem[], sourceNumber: string, sourceType: ProjectLineItem["sourceType"], sourceId = ""): ProjectLineItem[] =>
      src.map((i) => ({
        id: `${sourceType}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sourceId,
        sourceNumber,
        sourceType,
        productItemId: i.productKey,
        productItemName: i.productName,
        partNumber: i.partNumber,
        quantity: i.quantity,
        unitCost: Math.round(i.unitCost * 100),
        totalCost: Math.round(i.quantity * i.unitCost * 100),
        taxable: true,
      }));

    if (destination.type === "direct") {
      // productKey is "product:<uuid>" or "part:<uuid>" — extract the bare UUID
      // for the product_item_id FK (only valid for product: prefix; parts live in
      // a separate table and have no product_items row, so use null for them).
      draftItems.forEach((i) => {
        const productItemId = i.productKey.startsWith("product:")
          ? i.productKey.slice(8)
          : null;
        addDirectItem(
          {
            projectId: project.id,
            productItemId,
            productItemName: i.productName,
            partNumber: i.partNumber,
            quantity: i.quantity,
            unitCost: Math.round(i.unitCost * 100),
          },
          {
            onError: () => {
              import("sonner").then(({ toast }) =>
                toast.error("Failed to add material", { description: "Please try again." })
              );
            },
          }
        );
      });
    } else if (destination.type === "existing_req") {
      // Items added to existing REQ will appear via TanStack Query cache invalidation
    } else if (destination.type === "existing_po") {
      // Items added to existing PO will appear via TanStack Query cache invalidation
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

  // Build a tax-rate lookup keyed by source document id
  const taxRateBySourceId = new Map<string, number>();
  (purchaseOrders ?? []).forEach((po) => taxRateBySourceId.set(po.id, po.taxRatePercent));
  (requisitions ?? []).forEach((req) => taxRateBySourceId.set(req.id, req.taxRatePercent));

  const subtotal = items.reduce((sum, li) => sum + li.quantity * li.unitCost, 0);
  const totalTax = items.reduce((sum, li) => {
    if (li.taxable === false) return sum; // non-taxable items (deposits, delivery, etc.)
    const rate = taxRateBySourceId.get(li.sourceId) ?? 0;
    return sum + Math.round(li.quantity * li.unitCost * rate / 100);
  }, 0);

  // Allocate PO shipping proportionally: for each PO that has line items on this
  // project, include (project_subtotal_on_po / po_total_subtotal) × shipping_cost.
  const allocatedShipping = (purchaseOrders ?? []).reduce((acc, po) => {
    if (!po.shippingCost) return acc;
    const projectSubtotal = po.lineItems
      .filter((li) => li.projectId === project.id)
      .reduce((s, li) => s + li.quantity * li.unitCost, 0);
    if (projectSubtotal === 0) return acc;
    const poSubtotal = po.lineItems.reduce((s, li) => s + li.quantity * li.unitCost, 0);
    if (poSubtotal === 0) return acc;
    return acc + Math.round((projectSubtotal / poSubtotal) * po.shippingCost);
  }, 0);

  const total = subtotal + totalTax + allocatedShipping;

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
                    <TableCell className="font-medium">
                      {li.productItemId ? (
                        <button
                          type="button"
                          onClick={() => setSelectedProductId(li.productItemId)}
                          className="text-left font-medium text-brand-600 hover:underline"
                        >
                          {li.productItemName}
                        </button>
                      ) : (
                        li.productItemName
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{li.partNumber}</TableCell>
                    <TableCell className="text-right">{li.quantity}</TableCell>
                    <TableCell className="text-right text-slate-600">{formatCurrency(li.unitCost)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(li.quantity * li.unitCost)}</TableCell>
                    <TableCell>
                      {li.sourceType !== "direct" && li.sourceId ? (
                        <button type="button" onClick={() => setSelectedSourceItem(li)}>
                          <Badge
                            variant="outline"
                            className={`cursor-pointer hover:opacity-80 ${
                              li.sourceType === "po"
                                ? "border-blue-200 bg-blue-50 text-blue-700"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                          >
                            <ExternalLink className="mr-1 inline h-3 w-3" />
                            {li.sourceNumber}
                          </Badge>
                        </button>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-green-200 bg-green-50 text-green-700"
                        >
                          {li.sourceNumber}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-2 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => openEdit(li)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteItem(li)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500" title={li.sourceType !== "direct" ? "Remove from view only (edit via source document)" : "Delete"} disabled={li.sourceType !== "direct"}>
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
            <div className="flex justify-between py-1 text-slate-600">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {totalTax > 0 && (
              <div className="flex justify-between py-1 text-slate-600">
                <span>Sales Tax</span>
                <span>{formatCurrency(totalTax)}</span>
              </div>
            )}
            {allocatedShipping > 0 && (
              <div className="flex justify-between py-1 text-slate-600">
                <span>Shipping (from POs)</span>
                <span>{formatCurrency(allocatedShipping)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 font-semibold text-slate-900">
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

      {/* Source overlay — Requisition */}
      <Sheet
        open={!!selectedRequisition}
        onOpenChange={(o) => { if (!o) setSelectedSourceItem(null); }}
      >
        <SheetContent className="flex w-full flex-col overflow-hidden p-0 md:w-[580px] md:max-w-[580px]">
          <SheetHeader className="sr-only">
            <SheetTitle>{selectedRequisition?.requisitionNumber}</SheetTitle>
          </SheetHeader>
          {selectedRequisition && (
            <RequisitionDetailPanel key={selectedRequisition.id} requisition={selectedRequisition} />
          )}
        </SheetContent>
      </Sheet>

      {/* Source overlay — PO */}
      <PODetailSheet
        po={selectedPO}
        open={!!selectedPO}
        onOpenChange={(o) => { if (!o) setSelectedSourceItem(null); }}
      />

      {/* Product overlay */}
      <ProductDetailSheet
        product={selectedProduct}
        open={!!selectedProduct}
        onOpenChange={(o) => { if (!o) setSelectedProductId(null); }}
      />

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
                <Input type="number" min={0.01} step={0.01} value={editForm.quantity} onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))} autoFocus />
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

const COST_TYPE_LABELS: Record<SubcontractCostType, string> = {
  materials: "Materials",
  labor: "Labor",
  other: "Other",
};

const COST_TYPE_COLORS: Record<SubcontractCostType, string> = {
  materials: "border-orange-200 bg-orange-50 text-orange-700",
  labor: "border-blue-200 bg-blue-50 text-blue-700",
  other: "border-slate-200 bg-slate-50 text-slate-600",
};

const BLANK_FORM = {
  vendorId: "" as string,
  vendorName: "",
  description: "",
  costType: "labor" as SubcontractCostType,
  amount: "",
  costDate: "",
  notes: "",
};

function SubcontractsTab({ project }: { project: Project }) {
  const { data: costs = [], isLoading } = useProjectSubcontractCosts(project.id);
  const { data: vendors = [] } = useVendors();
  const { mutate: createCost, isPending: creating } = useCreateProjectSubcontractCost();
  const { mutate: updateCost, isPending: updating } = useUpdateProjectSubcontractCost();
  const { mutate: deleteCost } = useDeleteProjectSubcontractCost();

  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  function openAdd() {
    setForm(BLANK_FORM);
    setEditingId(null);
    setAddOpen(true);
  }

  function openEdit(cost: ProjectSubcontractCost) {
    setForm({
      vendorId: cost.vendorId ?? "",
      vendorName: cost.vendorName,
      description: cost.description,
      costType: cost.costType,
      amount: (cost.amount / 100).toFixed(2),
      costDate: cost.costDate ?? "",
      notes: cost.notes ?? "",
    });
    setEditingId(cost.id);
    setAddOpen(true);
  }

  function handleVendorChange(vendorId: string) {
    if (vendorId === "__manual__") {
      setForm((f) => ({ ...f, vendorId: "", vendorName: "" }));
      return;
    }
    const v = vendors.find((v) => v.id === vendorId);
    setForm((f) => ({ ...f, vendorId, vendorName: v?.name ?? "" }));
  }

  function handleSave() {
    const amount = Math.round(parseFloat(form.amount) * 100) || 0;
    const payload = {
      projectId: project.id,
      vendorId: form.vendorId || null,
      vendorName: form.vendorName.trim(),
      description: form.description.trim(),
      costType: form.costType,
      amount,
      costDate: form.costDate || null,
      notes: form.notes.trim() || null,
    };
    if (editingId) {
      updateCost({ id: editingId, ...payload }, { onSuccess: () => setAddOpen(false) });
    } else {
      createCost(payload, { onSuccess: () => setAddOpen(false) });
    }
  }

  const isValid = form.vendorName.trim() && form.description.trim() && parseFloat(form.amount) > 0;

  const materialTotal = costs.reduce((s, c) => c.costType === "materials" ? s + c.amount : s, 0);
  const laborTotal = costs.reduce((s, c) => c.costType === "labor" ? s + c.amount : s, 0);
  const otherTotal = costs.reduce((s, c) => c.costType === "other" ? s + c.amount : s, 0);
  const grandTotal = costs.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Subcontract Costs</p>
        <Button size="sm" variant="outline" onClick={openAdd} className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" />
          Add Cost
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : costs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 py-10 text-center">
          <Building2 className="h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No subcontract costs yet.</p>
          <Button size="sm" variant="outline" onClick={openAdd} className="mt-1 gap-1 text-xs">
            <Plus className="h-3 w-3" /> Add First Cost
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 text-xs">
                  <TableHead>Vendor</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.map((cost) => (
                  <TableRow key={cost.id} className="group text-sm">
                    <TableCell className="font-medium">{cost.vendorName}</TableCell>
                    <TableCell className="text-slate-600">{cost.description}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${COST_TYPE_COLORS[cost.costType]}`}>
                        {COST_TYPE_LABELS[cost.costType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500 text-xs">
                      {cost.costDate ? formatDate(cost.costDate) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(cost.amount)}</TableCell>
                    <TableCell className="px-2 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => openEdit(cost)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setDeleteConfirmId(cost.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500" title="Delete">
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
            {materialTotal > 0 && (
              <div className="flex justify-between py-1 text-slate-600">
                <span>Materials</span><span>{formatCurrency(materialTotal)}</span>
              </div>
            )}
            {laborTotal > 0 && (
              <div className="flex justify-between py-1 text-slate-600">
                <span>Labor</span><span>{formatCurrency(laborTotal)}</span>
              </div>
            )}
            {otherTotal > 0 && (
              <div className="flex justify-between py-1 text-slate-600">
                <span>Other</span><span>{formatCurrency(otherTotal)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 font-semibold text-slate-900">
              <span>Subcontract Total</span><span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) setAddOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Subcontract Cost" : "Add Subcontract Cost"}</DialogTitle>
            <DialogDescription>Record a cost from an outside vendor — materials they supplied or labor they performed.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {/* Vendor */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Vendor</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.vendorId || "__manual__"}
                onChange={(e) => handleVendorChange(e.target.value)}
              >
                <option value="__manual__">— Type vendor name —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              {(!form.vendorId) && (
                <Input
                  placeholder="Vendor name"
                  value={form.vendorName}
                  onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
                />
              )}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Description</label>
              <Input
                placeholder="e.g. Irrigation install, Mulch delivery"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Cost type + Amount */}
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Cost Type</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={form.costType}
                  onChange={(e) => setForm((f) => ({ ...f, costType: e.target.value as SubcontractCostType }))}
                >
                  <option value="materials">Materials</option>
                  <option value="labor">Labor</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Amount ($)</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
            </div>

            {/* Date */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Date (optional)</label>
              <Input
                type="date"
                value={form.costDate}
                onChange={(e) => setForm((f) => ({ ...f, costDate: e.target.value }))}
              />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Notes (optional)</label>
              <Input
                placeholder="Invoice #, PO reference, etc."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <Button onClick={handleSave} disabled={!isValid || creating || updating} className="mt-1">
              {creating || updating ? "Saving…" : editingId ? "Save Changes" : "Add Cost"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cost Entry</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to remove this subcontract cost? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteConfirmId) {
                  deleteCost({ id: deleteConfirmId, projectId: project.id });
                  setDeleteConfirmId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailsTab({
  project,
  status,
  onStatusChange,
  computedTotalCost,
}: {
  project: Project;
  status: ProjectStatus;
  onStatusChange: (s: ProjectStatus) => void;
  computedTotalCost: number;
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
        <MetaRow label="Address" value={formatAddress(project.address, project.city, project.state, project.zip)} />
        <MetaRow label="Start Date" value={formatDate(project.startDate)} />
        <MetaRow
          label="End Date"
          value={project.endDate ? formatDate(project.endDate) : "TBD"}
        />
        {project.notes && <MetaRow label="Notes" value={project.notes} />}
      </dl>

      <Separator />

      {/* Financials: price, cost, margin */}
      <div className="rounded-md border bg-slate-50 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Project Financials</p>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Contract Price</span>
            <span className="font-medium text-slate-900">
              {project.contractPrice > 0 ? formatCurrency(project.contractPrice) : <span className="text-slate-400 italic">Not set</span>}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Total Cost</span>
            <span className="font-medium text-slate-900">{formatCurrency(computedTotalCost)}</span>
          </div>
          {project.contractPrice > 0 && (() => {
            const margin = project.contractPrice - computedTotalCost;
            const marginPct = Math.round((margin / project.contractPrice) * 100);
            const isPositive = margin >= 0;
            return (
              <div className="flex justify-between border-t border-slate-200 pt-1.5">
                <span className="font-semibold text-slate-700">Margin</span>
                <span className={`font-semibold ${isPositive ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(Math.abs(margin))} {isPositive ? "" : "loss"} ({isPositive ? "" : "-"}{Math.abs(marginPct)}%)
                </span>
              </div>
            );
          })()}
        </div>
      </div>
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
  const { mutate: archiveProject, isPending: archiving } = useArchiveProject();
  const { mutate: updateProject } = useUpdateProject();
  const { data: allRequisitions } = useRequisitions();
  const { data: allPurchaseOrders } = usePurchaseOrders();
  const { data: subcontractCosts = [] } = useProjectSubcontractCosts(project.id);
  const { data: allDirectItems = [] } = useProjectDirectItems(project.id);

  // Compute project total cost dynamically from linked line items + allocated shipping + subcontract costs.
  // projects.total_cost in the DB is never written to, so we derive it here instead.
  const computedTotalCost = (() => {
    const taxRateBySourceId = new Map<string, number>();
    (allPurchaseOrders ?? []).forEach((po) => taxRateBySourceId.set(po.id, po.taxRatePercent));
    (allRequisitions ?? []).forEach((req) => taxRateBySourceId.set(req.id, req.taxRatePercent));

    let subtotal = 0;
    let tax = 0;

    (allRequisitions ?? []).forEach((req) => {
      if (req.convertedPoId && req.status === "ordered") return;
      req.lineItems.filter((li) => li.projectId === project.id).forEach((li) => {
        subtotal += li.quantity * li.unitCost;
        const rate = taxRateBySourceId.get(req.id) ?? 0;
        tax += Math.round(li.quantity * li.unitCost * rate / 100);
      });
    });
    (allPurchaseOrders ?? []).forEach((po) => {
      po.lineItems.filter((li) => li.projectId === project.id).forEach((li) => {
        subtotal += li.quantity * li.unitCost;
        if (li.taxable !== false) {
          const rate = taxRateBySourceId.get(po.id) ?? 0;
          tax += Math.round(li.quantity * li.unitCost * rate / 100);
        }
      });
    });

    // Allocate PO shipping proportionally across the projects that share each PO
    const allocatedShipping = (allPurchaseOrders ?? []).reduce((acc, po) => {
      if (!po.shippingCost) return acc;
      const projectSubtotal = po.lineItems
        .filter((li) => li.projectId === project.id)
        .reduce((s, li) => s + li.quantity * li.unitCost, 0);
      if (projectSubtotal === 0) return acc;
      const poSubtotal = po.lineItems.reduce((s, li) => s + li.quantity * li.unitCost, 0);
      if (poSubtotal === 0) return acc;
      return acc + Math.round((projectSubtotal / poSubtotal) * po.shippingCost);
    }, 0);

    const subcontractTotal = subcontractCosts.reduce((s, c) => s + c.amount, 0);
    const directTotal = allDirectItems.reduce((s, di) => s + di.quantity * di.unitCost, 0);

    return subtotal + tax + allocatedShipping + subcontractTotal + directTotal;
  })();

  function getPrintMaterials() {
    const materials: Array<{ productItemName: string; partNumber: string; quantity: number; unitCost: number; sourceNumber: string; sourceType: string }> = [];
    (allRequisitions ?? []).forEach((req) => {
      if (req.convertedPoId && req.status === "ordered") return;
      req.lineItems.filter((li) => li.projectId === project.id).forEach((li) => {
        materials.push({ productItemName: li.productItemName, partNumber: li.partNumber, quantity: li.quantity, unitCost: li.unitCost, sourceNumber: req.requisitionNumber, sourceType: "requisition" });
      });
    });
    (allPurchaseOrders ?? []).forEach((po) => {
      po.lineItems.filter((li) => li.projectId === project.id).forEach((li) => {
        materials.push({ productItemName: li.productItemName, partNumber: li.partNumber, quantity: li.quantity, unitCost: li.unitCost, sourceNumber: po.poNumber, sourceType: "po" });
      });
    });
    allDirectItems.forEach((di) => {
      materials.push({ productItemName: di.productItemName, partNumber: di.partNumber, quantity: di.quantity, unitCost: di.unitCost, sourceNumber: "Direct", sourceType: "direct" });
    });
    return materials;
  }

  // Sync if a different project is selected
  useEffect(() => {
    setStatus(project.status);
  }, [project.id, project.status]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        {/* Title row — pr-10 leaves room for Sheet's absolute close button */}
        <div className="flex items-start justify-between pr-10">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">{project.name}</h2>
              {project.isArchived && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Archived</span>
              )}
              <StatusBadge
                variant={status === "on_hold" ? "on_hold_project" : status}
                label={PROJECT_STATUS_LABELS[status]}
              />
            </div>
            <p className="text-sm text-slate-500">{project.customerName}</p>
          </div>
        </div>
        {/* Action buttons row — wraps on mobile so nothing overflows */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printProject(project, getPrintMaterials())}>
            <Download className="h-3.5 w-3.5" />
            PDF
          </Button>
          <EditButton onClick={() => setEditOpen(true)} />
          <Button
            variant="ghost"
            size="sm"
            className={project.isArchived ? "text-amber-600 hover:text-amber-700" : "text-slate-400 hover:text-slate-600"}
            disabled={archiving}
            onClick={() => archiveProject(
              { id: project.id, archived: !project.isArchived },
              { onSuccess: () => toast.success(project.isArchived ? "Project unarchived" : "Project archived — it will no longer appear in dropdowns or the active list") }
            )}
            title={project.isArchived ? "Unarchive project" : "Archive project"}
          >
            {project.isArchived ? "Unarchive" : "Archive"}
          </Button>
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
            content: (
              <DetailsTab
                project={project}
                status={status}
                computedTotalCost={computedTotalCost}
                onStatusChange={(s) => {
                  setStatus(s);
                  updateProject({ id: project.id, status: s });
                }}
              />
            ),
          },
          {
            value: "materials",
            label: "Materials",
            content: <MaterialsTab project={project} />,
          },
          {
            value: "subcontracts",
            label: "Subcontracts",
            content: <SubcontractsTab project={project} />,
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
