"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, PackageCheck } from "lucide-react";
import { useUsers } from "@/lib/hooks/use-users";
import { useProducts, useReceiveProductCostLayer } from "@/lib/hooks/use-products";
import { useParts } from "@/lib/hooks/use-parts";
import { useReceivePartCostLayer } from "@/lib/hooks/use-parts";
import { useCreateGoodsReceipt } from "@/lib/hooks/use-goods-receipts";
import { formatCurrency } from "@/lib/utils";
import type { PurchaseOrder, LineItem } from "@/types";

interface ReceiptDraftLine {
  lineItemId: string;
  productItemName: string;
  partNumber: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number; // cents
  isMaintPart: boolean;
}

interface ReceiveGoodsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  po: PurchaseOrder;
  /** Called when receipt is successfully submitted — parent can transition PO status */
  onReceiptSubmit?: (fullyReceived: boolean) => void;
}

export function ReceiveGoodsDialog({
  open,
  onOpenChange,
  po,
  onReceiptSubmit,
}: ReceiveGoodsDialogProps) {
  const { data: users = [] } = useUsers();
  const { data: products = [] } = useProducts();
  const { data: parts = [] } = useParts();
  const { mutate: receivePartLayer } = useReceivePartCostLayer();
  const { mutate: receiveProductLayer } = useReceiveProductCostLayer();
  const { mutate: createReceipt, isPending: saving } = useCreateGoodsReceipt();

  const [lines, setLines] = useState<ReceiptDraftLine[]>([]);
  const [receivedById, setReceivedById] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Build the maintenance-part part-number set for quick lookup
  const maintPartNumbers = new Set(
    products
      .filter((p) => p.category === "maintenance_part")
      .map((p) => p.partNumber)
  );

  // Initialise lines from PO line items whenever dialog opens
  useEffect(() => {
    if (open) {
      setLines(
        po.lineItems.map((li: LineItem) => ({
          lineItemId: li.id,
          productItemName: li.productItemName,
          partNumber: li.partNumber,
          quantityOrdered: li.quantity,
          quantityReceived: li.quantity, // default to full quantity
          unitCost: li.unitCost,
          isMaintPart: maintPartNumbers.has(li.partNumber),
        }))
      );
      setReceivedById("");
      setNotes("");
      setSubmitted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleQtyChange(lineItemId: string, qty: number) {
    setLines((prev) =>
      prev.map((l) =>
        l.lineItemId === lineItemId
          ? { ...l, quantityReceived: Math.max(0, Math.min(qty, l.quantityOrdered)) }
          : l
      )
    );
  }

  const subtotal = lines.reduce(
    (sum, l) => sum + l.quantityReceived * l.unitCost,
    0
  );
  const salesTax = Math.round(subtotal * (po.taxRatePercent / 100));
  const grandTotal = subtotal + salesTax + po.shippingCost;

  const allFullyReceived = lines.every(
    (l) => l.quantityReceived === l.quantityOrdered
  );
  const someReceived = lines.some((l) => l.quantityReceived > 0);
  const isValid = someReceived && receivedById !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    const receivedAt = new Date().toISOString();
    const receiptNumber = `GR-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const receivedUser = users.find((u) => u.id === receivedById);
    const receivedByName = receivedUser?.name ?? "";

    // Update cost layers for every received line item.
    // This never modifies the line items on this or any other PO/WO —
    // it only updates the catalog record's cost history for future pre-fills.
    lines.forEach((line) => {
      if (line.quantityReceived <= 0) return;

      // Find the PO line item to look up the productItemId
      const poLineItem = po.lineItems.find((li) => li.id === line.lineItemId);
      if (!poLineItem) return;

      // Bare product ID (strip prefix if present)
      const rawId = poLineItem.productItemId?.replace(/^product:/, "") ?? "";

      const matchedProduct = products.find(
        (p) => p.id === rawId || p.partNumber === line.partNumber
      );

      if (matchedProduct?.category === "maintenance_part") {
        // Also update the Parts inventory record if one is linked
        const linkedPart = parts.find((pt) => pt.productItemId === matchedProduct.id || pt.partNumber === line.partNumber);
        if (linkedPart) {
          receivePartLayer({
            partId: linkedPart.id,
            quantity: line.quantityReceived,
            unitCost: line.unitCost,
            receivedAt,
            poNumber: po.poNumber,
          });
        }
        receiveProductLayer({
          productId: matchedProduct.id,
          quantity: line.quantityReceived,
          unitCost: line.unitCost,
          receivedAt,
          poNumber: po.poNumber,
        });
      } else if (matchedProduct) {
        receiveProductLayer({
          productId: matchedProduct.id,
          quantity: line.quantityReceived,
          unitCost: line.unitCost,
          receivedAt,
          poNumber: po.poNumber,
        });
      }
    });

    // Persist the goods receipt record to the database
    createReceipt(
      {
        receiptNumber,
        purchaseOrderId: po.id,
        poNumber: po.poNumber,
        vendorName: po.vendorName ?? "",
        receivedById,
        receivedByName,
        receivedAt,
        subtotal,
        taxRatePercent: po.taxRatePercent,
        salesTax,
        shippingCost: po.shippingCost,
        grandTotal,
        notes: notes || null,
        lines: lines
          .filter((l) => l.quantityReceived > 0)
          .map((l) => ({
            id: "",           // generated by DB on insert
            lineItemId: l.lineItemId,
            productItemName: l.productItemName,
            partNumber: l.partNumber,
            quantityOrdered: l.quantityOrdered,
            quantityReceived: l.quantityReceived,
            quantityRemaining: l.quantityOrdered - l.quantityReceived,
            unitCost: l.unitCost,
            isMaintPart: l.isMaintPart,
          })),
      },
      {
        onSuccess: () => setSubmitted(true),
      }
    );
  }

  function handleClose() {
    if (submitted) {
      onReceiptSubmit?.(allFullyReceived);
    }
    onOpenChange(false);
    setSubmitted(false);
  }

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[480px]">
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Receipt Recorded</h3>
              <p className="mt-1 text-sm text-slate-500">
                {allFullyReceived
                  ? "All items have been received. The PO will be marked as completed."
                  : "Partial receipt recorded. The PO will be marked as partially fulfilled."}
              </p>
            </div>
            <Button onClick={handleClose} className="mt-2">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-slate-500" />
            Receive Goods — {po.poNumber}
          </DialogTitle>
          <DialogDescription>
            Enter the quantities received for each line item. You can do a partial
            receipt if items are backordered.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[65vh] overflow-y-auto px-1">
            <div className="space-y-5 pb-4">
              {/* Line items table */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Line Items
                </p>
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 text-xs">
                        <TableHead>Item</TableHead>
                        <TableHead>Part #</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-right">Ordered</TableHead>
                        <TableHead className="w-28 text-right">Received</TableHead>
                        <TableHead>Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => (
                        <TableRow key={line.lineItemId} className="text-sm">
                          <TableCell className="font-medium">
                            {line.productItemName}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-500">
                            {line.partNumber || "—"}
                          </TableCell>
                          <TableCell className="text-right text-slate-600">
                            {formatCurrency(line.unitCost)}
                          </TableCell>
                          <TableCell className="text-right">
                            {line.quantityOrdered}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={line.quantityOrdered}
                              className="h-8 w-20 text-right text-xs"
                              value={line.quantityReceived}
                              onChange={(e) =>
                                handleQtyChange(
                                  line.lineItemId,
                                  parseInt(e.target.value) || 0
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            {line.isMaintPart ? (
                              <Badge
                                variant="outline"
                                className="border-purple-200 bg-purple-50 text-xs text-purple-700"
                              >
                                Maint. Part
                              </Badge>
                            ) : (
                              <span className="text-xs text-slate-400">Material</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {lines.some((l) => l.isMaintPart) && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Items marked as <span className="font-medium text-purple-700">Maint. Part</span> will
                    automatically update Parts Inventory quantities on receipt.
                  </p>
                )}
              </div>

              {/* Totals */}
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="flex justify-between py-0.5 text-slate-600">
                  <span>Subtotal (received)</span>
                  <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
                {po.taxRatePercent > 0 && (
                  <div className="flex justify-between py-0.5 text-slate-600">
                    <span>Tax ({po.taxRatePercent}%)</span>
                    <span className="tabular-nums">{formatCurrency(salesTax)}</span>
                  </div>
                )}
                {po.shippingCost > 0 && (
                  <div className="flex justify-between py-0.5 text-slate-600">
                    <span>Shipping / Other</span>
                    <span className="tabular-nums">{formatCurrency(po.shippingCost)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 font-semibold text-slate-900">
                  <span>Receipt Total</span>
                  <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              {/* Received by + Notes */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="received-by">
                    Received By <span className="text-red-500">*</span>
                  </Label>
                  <Select value={receivedById} onValueChange={setReceivedById}>
                    <SelectTrigger id="received-by">
                      <SelectValue placeholder="Select person" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="recv-notes">Notes (optional)</Label>
                  <Textarea
                    id="recv-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Condition of goods, backorder notes, etc."
                    className="resize-none"
                  />
                </div>
              </div>

              {!allFullyReceived && someReceived && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <span className="font-medium">Partial receipt:</span> One or more items have a
                  received quantity less than ordered. The PO will be marked as{" "}
                  <span className="font-medium">Partially Fulfilled</span>.
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? "Saving..." : "Record Receipt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
