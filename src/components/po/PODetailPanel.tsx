"use client";

import { useState, useEffect } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { RecordDetailTabs } from "@/components/shared/RecordDetailTabs";
import { CommentsSection } from "@/components/shared/CommentsSection";
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { LineItemsTable } from "./LineItemsTable";
import { POPaymentTracking } from "./POPaymentTracking";
import { ProductDetailSheet } from "./ProductDetailSheet";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { EditButton } from "@/components/shared/EditButton";
import { NewPODialog } from "./NewPODialog";
import { ReceiveGoodsDialog } from "./ReceiveGoodsDialog";
import { StatusFlowIndicator } from "@/components/shared/StatusFlowIndicator";
import { ApprovalChain } from "@/components/shared/ApprovalChain";
import { PO_STATUS_LABELS } from "@/lib/constants";
import { useProducts } from "@/lib/hooks/use-products";
import { useProjects } from "@/lib/hooks/use-projects";
import { useSubmitForApproval } from "@/lib/hooks/use-approval-requests";
import { useUpdatePurchaseOrderStatus } from "@/lib/hooks/use-purchase-orders";
import { useCurrentUserStore } from "@/stores";
import { ProjectDetailSheet } from "./ProjectDetailSheet";
import { printPO } from "@/lib/print";
import { Download } from "lucide-react";
import type { PurchaseOrder, LineItem, POStatus } from "@/types";

interface PODetailPanelProps {
  po: PurchaseOrder;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

const PO_FLOW_STEPS = [
  { label: "Requested" },
  { label: "Pending" },
  { label: "Approved" },
  { label: "Completed" },
];

const PO_STATUS_INDEX: Record<string, number> = {
  requested: 0,
  pending: 1,
  approved: 2,
  ordered: 2,
  partially_fulfilled: 2,
  completed: 3,
  rejected: 1,
  canceled: 1,
};

function DetailsTab({
  po,
  status,
  onStatusChange,
  onSendToReceiving,
  onProjectClick,
}: {
  po: PurchaseOrder;
  status: POStatus;
  onStatusChange: (s: POStatus) => void;
  onSendToReceiving: () => void;
  onProjectClick?: (projectId: string) => void;
}) {
  const [lineItems, setLineItems] = useState<LineItem[]>(po.lineItems);
  const { currentUser } = useCurrentUserStore();
  const { mutate: submitForApproval, isPending: submitting } = useSubmitForApproval();
  const { mutate: syncStatus } = useUpdatePurchaseOrderStatus();

  // Write status change to shared store so the list panel stays in sync
  function handleStatusChange(s: POStatus) {
    onStatusChange(s);
    syncStatus({ id: po.id, status: s });
  }

  const subtotalForSubmit = lineItems.reduce((sum, li) => sum + li.quantity * li.unitCost, 0);
  const grandTotalForSubmit =
    subtotalForSubmit + Math.round((subtotalForSubmit * po.taxRatePercent) / 100) + po.shippingCost;

  const { data: products = [] } = useProducts();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;

  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitCost, 0);
  const salesTax = Math.round(subtotal * po.taxRatePercent / 100);
  const grandTotal = subtotal + salesTax + po.shippingCost;
  const taxLabel = po.taxRatePercent > 0 ? `Sales Tax (${po.taxRatePercent}%)` : "Sales Tax";
  const isError = status === "rejected" || status === "canceled";

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Status
        </p>
        <StatusFlowIndicator
          steps={PO_FLOW_STEPS}
          currentIndex={PO_STATUS_INDEX[status] ?? 0}
          isTerminalError={isError}
        />
        {/* Submit for approval */}
        {status === "requested" && (
          <div className="mt-3">
            <Button
              size="sm"
              disabled={submitting}
              onClick={() => {
                submitForApproval(
                  { entityId: po.id, entityType: "purchase_order", grandTotalCents: grandTotalForSubmit },
                  // The hook updates the DB status — only update local state here
                  { onSuccess: () => onStatusChange("pending") }
                );
              }}
            >
              {submitting ? "Submitting…" : "Submit for Approval"}
            </Button>
          </div>
        )}

        {/* Approval chain */}
        {(status === "pending" || status === "approved" || status === "rejected") && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-slate-500">Approval Chain</p>
            <ApprovalChain
              entityId={po.id}
              // The hook writes the DB status; only update local state here
              onApproved={() => onStatusChange("approved")}
              onRejected={() => onStatusChange("rejected")}
            />
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {status === "approved" && (<>
            <Button size="sm" onClick={() => handleStatusChange("ordered")}>Mark as Ordered</Button>
          </>)}
          {(status === "ordered" || status === "partially_fulfilled") && (<>
            <Button size="sm" onClick={onSendToReceiving}>Send to Receiving</Button>
            <Button size="sm" variant="outline" onClick={() => handleStatusChange("completed")}>Mark Complete</Button>
          </>)}
          {(status === "rejected" || status === "canceled") && (
            <Button size="sm" variant="outline" onClick={() => handleStatusChange("requested")}>Reopen</Button>
          )}
        </div>
      </div>

      <Separator />

      <dl>
        <MetaRow label="Vendor" value={po.vendorName} />
        <MetaRow label="Status" value={<StatusBadge variant={status} label={PO_STATUS_LABELS[status]} />} />
        <MetaRow label="Invoice #" value={po.invoiceNumber} />
        <MetaRow
          label="Payment Type"
          value={
            po.paymentType
              ? po.paymentType === "credit_card"
                ? "Credit Card"
                : po.paymentType.toUpperCase()
              : "—"
          }
        />
        <MetaRow label="Created" value={formatDate(po.createdAt)} />
        <MetaRow label="Updated" value={formatDate(po.updatedAt)} />
        {po.notes && <MetaRow label="Notes" value={po.notes} />}
      </dl>

      <Separator />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Line Items
        </p>
        <LineItemsTable
          lineItems={lineItems}
          showProject
          editable
          onItemsChange={setLineItems}
          onProductClick={(id) => setSelectedProductId(id)}
          onProjectClick={onProjectClick}
        />
      </div>

      <div className="rounded-md bg-slate-50 p-3 text-sm">
        <div className="flex justify-between py-1 text-slate-600">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between py-1 text-slate-600">
          <span>{taxLabel}</span>
          <span>{formatCurrency(salesTax)}</span>
        </div>
        {po.shippingCost > 0 && (
          <div className="flex justify-between py-1 text-slate-600">
            <span>Shipping / Other</span>
            <span>{formatCurrency(po.shippingCost)}</span>
          </div>
        )}
        <Separator className="my-1" />
        <div className="flex justify-between py-1 font-semibold text-slate-900">
          <span>Grand Total</span>
          <span>{formatCurrency(grandTotal)}</span>
        </div>
      </div>

      <POPaymentTracking po={po} />

      <ProductDetailSheet
        product={selectedProduct}
        open={!!selectedProduct}
        onOpenChange={(open) => {
          if (!open) setSelectedProductId(null);
        }}
      />
    </div>
  );
}

function HistoryTab({ po }: { po: PurchaseOrder }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Comments
        </p>
        <CommentsSection recordType="po" recordId={po.id} />
      </div>

      <Separator className="mb-6" />

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Audit Trail
      </p>
      <AuditTrailTab recordType="po" recordId={po.id} />
    </div>
  );
}

function FilesTab({ po }: { po: PurchaseOrder }) {
  return (
    <div className="p-6">
      <AttachmentsSection recordType="po" recordId={po.id} />
    </div>
  );
}

export function PODetailPanel({ po }: PODetailPanelProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [status, setStatus] = useState<POStatus>(po.status);

  // Keep local status in sync when the PO is refetched from the server
  // (e.g. after another user approves or the user navigates away and back)
  useEffect(() => {
    setStatus(po.status);
  }, [po.status]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const { data: projects = [] } = useProjects();
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const { mutate: syncStatus } = useUpdatePurchaseOrderStatus();

  function handleReceiptSubmit(fullyReceived: boolean) {
    const newStatus: POStatus = fullyReceived ? "completed" : "partially_fulfilled";
    setStatus(newStatus);
    syncStatus({ id: po.id, status: newStatus });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4 pr-12">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{po.poNumber}</h2>
          <p className="text-sm text-slate-500">{po.vendorName}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge variant={status} label={PO_STATUS_LABELS[status]} />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
            const projMap = new Map(projects.map((p) => [p.id, p.name]));
            printPO(po, projMap);
          }}>
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
                po={po}
                status={status}
                onStatusChange={setStatus}
                onSendToReceiving={() => setReceiveOpen(true)}
                onProjectClick={(id) => setSelectedProjectId(id)}
              />
            ),
          },
          { value: "history", label: "Comments & History", content: <HistoryTab po={po} /> },
          { value: "files", label: "Files", content: <FilesTab po={po} /> },
        ]}
      />

      <NewPODialog open={editOpen} onOpenChange={setEditOpen} initialData={po} />
      <ReceiveGoodsDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        po={po}
        onReceiptSubmit={handleReceiptSubmit}
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
