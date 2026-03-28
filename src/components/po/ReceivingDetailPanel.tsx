"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { EditButton } from "@/components/shared/EditButton";
import { StatusFlowIndicator } from "@/components/shared/StatusFlowIndicator";
import { Separator } from "@/components/ui/separator";
import { RecordDetailTabs } from "@/components/shared/RecordDetailTabs";
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { CommentsSection } from "@/components/shared/CommentsSection";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { NewReceivingDialog } from "./NewReceivingDialog";
import { ProductDetailSheet } from "./ProductDetailSheet";
import { PODetailSheet } from "./PODetailSheet";
import { useProducts } from "@/lib/hooks/use-products";
import { usePurchaseOrders, useUpdatePurchaseOrderStatus } from "@/lib/hooks/use-purchase-orders";
import { useGoodsReceipts } from "@/lib/hooks/use-goods-receipts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { GoodsReceipt } from "@/types";

interface ReceivingDetailPanelProps {
  receipt: GoodsReceipt;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

const RECEIVING_FLOW_STEPS = [
  { label: "PO Placed" },
  { label: "Goods Received" },
  { label: "Inventory Updated" },
];

function DetailsTab({
  receipt,
  onProductClick,
  onPOClick,
}: {
  receipt: GoodsReceipt;
  onProductClick: (partNumber: string) => void;
  onPOClick: () => void;
}) {
  const hasMaintParts = receipt.lines.some((l) => l.isMaintPart);
  const taxLabel =
    receipt.taxRatePercent > 0 ? `Sales Tax (${receipt.taxRatePercent}%)` : "Sales Tax";
  const receivingIndex = hasMaintParts ? 2 : 1;

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
        <StatusFlowIndicator steps={RECEIVING_FLOW_STEPS} currentIndex={receivingIndex} />
      </div>

      <Separator />

      <dl>
        <MetaRow label="Vendor" value={receipt.vendorName} />
        <MetaRow
          label="Purchase Order"
          value={
            <button type="button" onClick={onPOClick}>
              <Badge variant="outline" className="cursor-pointer border-blue-200 bg-blue-50 text-blue-700 hover:opacity-80">
                {receipt.poNumber}
              </Badge>
            </button>
          }
        />
        <MetaRow label="Received By" value={receipt.receivedByName} />
        <MetaRow label="Received At" value={formatDate(receipt.receivedAt)} />
        {receipt.notes && <MetaRow label="Notes" value={receipt.notes} />}
      </dl>

      {hasMaintParts && (
        <div className="flex items-start gap-2 rounded-md border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">Maintenance Parts note:</span> Items marked as
            maintenance parts automatically update Parts Inventory quantities on receipt.
          </span>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Receipt Lines
        </p>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 text-xs">
                <TableHead>Item</TableHead>
                <TableHead>Part #</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipt.lines.map((line) => (
                <TableRow key={line.id} className="text-sm">
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      onClick={() => onProductClick(line.partNumber)}
                      className="text-left font-medium text-brand-600 hover:underline"
                    >
                      {line.productItemName}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">
                    {line.partNumber}
                  </TableCell>
                  <TableCell className="text-right text-slate-600">
                    {formatCurrency(line.unitCost)}
                  </TableCell>
                  <TableCell className="text-right">{line.quantityOrdered}</TableCell>
                  <TableCell className="text-right font-medium text-green-700">
                    {line.quantityReceived}
                  </TableCell>
                  <TableCell className="text-right">
                    {line.quantityRemaining > 0 ? (
                      <span className="font-medium text-orange-600">{line.quantityRemaining}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {line.isMaintPart ? (
                      <span className="text-xs font-medium text-purple-700">Maint. Part</span>
                    ) : (
                      <span className="text-xs text-slate-400">Material</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-md bg-slate-50 p-3 text-sm">
        <div className="flex justify-between py-1 text-slate-600">
          <span>Subtotal</span>
          <span>{formatCurrency(receipt.subtotal)}</span>
        </div>
        <div className="flex justify-between py-1 text-slate-600">
          <span>{taxLabel}</span>
          <span>{formatCurrency(receipt.salesTax)}</span>
        </div>
        {receipt.shippingCost > 0 && (
          <div className="flex justify-between py-1 text-slate-600">
            <span>Shipping / Other</span>
            <span>{formatCurrency(receipt.shippingCost)}</span>
          </div>
        )}
        <Separator className="my-1" />
        <div className="flex justify-between py-1 font-semibold text-slate-900">
          <span>Grand Total</span>
          <span>{formatCurrency(receipt.grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ receipt }: { receipt: GoodsReceipt }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Comments
        </p>
        <CommentsSection recordType="receiving" recordId={receipt.id} />
      </div>
      <Separator className="mb-6" />
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Audit Trail
      </p>
      <AuditTrailTab recordType="receiving" recordId={receipt.id} />
    </div>
  );
}

function FilesTab({ receipt }: { receipt: GoodsReceipt }) {
  return (
    <div className="p-6">
      <AttachmentsSection recordType="receiving" recordId={receipt.id} />
    </div>
  );
}

export function ReceivingDetailPanel({ receipt }: ReceivingDetailPanelProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [selectedPartNumber, setSelectedPartNumber] = useState<string | null>(null);
  const [poSheetOpen, setPoSheetOpen] = useState(false);
  const { data: products = [] } = useProducts();
  const { data: purchaseOrders = [] } = usePurchaseOrders();
  const { data: allReceipts = [] } = useGoodsReceipts();
  const syncPOStatus = useUpdatePurchaseOrderStatus();

  const selectedProduct =
    selectedPartNumber
      ? (products.find((p) => p.partNumber === selectedPartNumber) ?? null)
      : null;

  const linkedPO = purchaseOrders.find((po) => po.id === receipt.purchaseOrderId) ?? null;

  function handleReceiptEdit(currentReceiptAllFull: boolean) {
    if (!linkedPO) return;
    // Check ALL receipts for this PO, not just the current one
    const poReceipts = allReceipts.filter((r) => r.purchaseOrderId === receipt.purchaseOrderId && r.id !== receipt.id);
    const othersFull = poReceipts.every((r) => r.lines.every((l) => l.quantityRemaining <= 0));
    const allFullyReceived = currentReceiptAllFull && othersFull;
    const newStatus = allFullyReceived ? "completed" : "partially_fulfilled";
    // Only update if different from current PO status
    if (linkedPO.status !== newStatus) {
      syncPOStatus.mutate({ id: linkedPO.id, status: newStatus });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4 pr-12">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{receipt.receiptNumber}</h2>
          <p className="text-sm text-slate-500">
            {receipt.vendorName} · {receipt.poNumber}
          </p>
        </div>
        <EditButton onClick={() => setEditOpen(true)} />
      </div>

      <RecordDetailTabs
        tabs={[
          {
            value: "details",
            label: "Details",
            content: (
              <DetailsTab
                receipt={receipt}
                onProductClick={(partNumber) => setSelectedPartNumber(partNumber)}
                onPOClick={() => setPoSheetOpen(true)}
              />
            ),
          },
          {
            value: "history",
            label: "Comments & History",
            content: <HistoryTab receipt={receipt} />,
          },
          { value: "files", label: "Files", content: <FilesTab receipt={receipt} /> },
        ]}
      />

      <NewReceivingDialog open={editOpen} onOpenChange={setEditOpen} initialData={receipt} onReceiptEdit={handleReceiptEdit} />
      <ProductDetailSheet
        open={!!selectedProduct}
        onOpenChange={(o) => {
          if (!o) setSelectedPartNumber(null);
        }}
        product={selectedProduct}
      />
      <PODetailSheet
        po={linkedPO}
        open={poSheetOpen && !!linkedPO}
        onOpenChange={(o) => { if (!o) setPoSheetOpen(false); }}
      />
    </div>
  );
}
