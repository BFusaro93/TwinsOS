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
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useUsers } from "@/lib/hooks/use-users";
import { useProducts, useReceiveProductCostLayer } from "@/lib/hooks/use-products";
import { useParts } from "@/lib/hooks/use-parts";
import { useReceivePartCostLayer } from "@/lib/hooks/use-parts";
import { useCreateGoodsReceipt, useDeleteGoodsReceipt, useGoodsReceipts } from "@/lib/hooks/use-goods-receipts";
import { formatCurrency } from "@/lib/utils";
import type { PurchaseOrder, LineItem } from "@/types";

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

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
  const { mutateAsync: receivePartLayer } = useReceivePartCostLayer();
  const { mutateAsync: receiveProductLayer } = useReceiveProductCostLayer();
  const { mutateAsync: createReceipt, isPending: saving } = useCreateGoodsReceipt();
  const { mutateAsync: deleteReceipt } = useDeleteGoodsReceipt();
  const { data: allReceipts = [], isFetched: receiptsFetched } = useGoodsReceipts();
  const [applyingInventory, setApplyingInventory] = useState(false);

  // Total already received per line item across all prior receipts for this PO
  const alreadyReceivedMap = allReceipts
    .filter((r) => r.purchaseOrderId === po.id)
    .flatMap((r) => r.lines)
    .reduce((map, l) => {
      map.set(l.lineItemId, (map.get(l.lineItemId) ?? 0) + l.quantityReceived);
      return map;
    }, new Map<string, number>());

  const [lines, setLines] = useState<ReceiptDraftLine[]>([]);
  const [receivedById, setReceivedById] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Resolves a PO line to its catalog product with the same strict
  // priority used at submit time below: UUID first, then a non-empty part
  // number, then exact name. A blank part number must never be used to
  // match — plenty of legitimate non-maintenance-part lines (mulch,
  // chemicals, etc.) have no part number, and matching on "" would tag
  // every one of them as a maintenance part the moment ANY maintenance
  // part in the catalog also happens to have a blank part number.
  function matchProductForLine(li: LineItem) {
    const rawId = li.productItemId?.replace(/^product:/, "") ?? "";
    return (
      (rawId ? products.find((p) => p.id === rawId) : null) ??
      (li.partNumber ? products.find((p) => p.partNumber === li.partNumber) : null) ??
      (li.productItemName ? products.find((p) => p.name === li.productItemName) : null) ??
      null
    );
  }

  // Initialise lines from PO line items whenever the dialog opens. Also
  // re-runs once `receiptsFetched` flips to true: if the dialog is opened
  // before useGoodsReceipts() resolves, alreadyReceivedMap is still empty
  // (allReceipts defaults to []), so `remaining` would default to the FULL
  // ordered quantity instead of what's actually still outstanding — and
  // since this effect only depended on `open`, that wrong default would
  // never get recomputed once the query did resolve.
  useEffect(() => {
    if (open && receiptsFetched) {
      setLines(
        po.lineItems.map((li: LineItem) => {
          const alreadyReceived = alreadyReceivedMap.get(li.id) ?? 0;
          const remaining = Math.max(0, li.quantity - alreadyReceived);
          return {
            lineItemId: li.id,
            productItemName: li.productItemName,
            partNumber: li.partNumber,
            quantityOrdered: li.quantity,
            quantityReceived: remaining, // default to remaining only
            unitCost: li.unitCost,
            isMaintPart: matchProductForLine(li)?.category === "maintenance_part",
          };
        })
      );
      setReceivedById("");
      setNotes("");
      setSubmitted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, receiptsFetched]);

  function handleQtyChange(lineItemId: string, qty: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.lineItemId !== lineItemId) return l;
        const alreadyReceived = alreadyReceivedMap.get(l.lineItemId) ?? 0;
        const remaining = Math.max(0, l.quantityOrdered - alreadyReceived);
        // Maintenance parts are discrete units (can't receive 3.5 oil filters);
        // materials (mulch, chemicals, etc.) are legitimately fractional.
        const normalized = l.isMaintPart ? Math.round(qty) : Math.round(qty * 100) / 100;
        return { ...l, quantityReceived: Math.max(0, Math.min(normalized, remaining)) };
      })
    );
  }

  const subtotal = Math.round(lines.reduce(
    (sum, l) => sum + l.quantityReceived * l.unitCost,
    0
  ));
  const taxableSubtotal = Math.round(lines
    .filter((l) => {
      // Find the original PO line to check taxable flag (defaults to true)
      const poLine = po.lineItems.find((li) => li.id === l.lineItemId);
      return poLine?.taxable !== false;
    })
    .reduce((sum, l) => sum + l.quantityReceived * l.unitCost, 0)
  );
  const salesTax = Math.round(taxableSubtotal * (po.taxRatePercent / 100));
  // A PO-level discount is a single flat amount for the whole order, but
  // receiving can happen across multiple partial receipts — applying it in
  // full to every receipt would double- (or triple-) count it, while
  // omitting it entirely (the prior behavior) overstated every receipt's
  // total on any PO with a discount. Prorate it by this receipt's share of
  // the PO's total ordered subtotal instead.
  const discountShare = po.discountCost > 0 && po.subtotal > 0
    ? Math.round(po.discountCost * (subtotal / po.subtotal))
    : 0;
  const grandTotal = subtotal - discountShare + salesTax + po.shippingCost;

  // Compares the CUMULATIVE received quantity (this receipt + everything
  // already received on prior receipts) against what was ordered — a plain
  // `l.quantityReceived === l.quantityOrdered` only looked at THIS
  // receipt's quantity, so a PO received across two partial receipts that
  // together add up to the full order could never reach "completed": the
  // second (final) receipt's own quantityReceived defaults to the
  // remaining balance, which only equals quantityOrdered when nothing was
  // received before it.
  const allFullyReceived = lines.every((l) => {
    const alreadyReceived = alreadyReceivedMap.get(l.lineItemId) ?? 0;
    return alreadyReceived + l.quantityReceived >= l.quantityOrdered;
  });
  const someReceived = lines.some((l) => l.quantityReceived > 0);
  const isValid = someReceived && receivedById !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || applyingInventory || saving) return;

    const receivedAt = new Date().toISOString();
    const receiptNumber = `GR-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const receivedUser = users.find((u) => u.id === receivedById);
    const receivedByName = receivedUser?.name ?? "";

    const linesToReceive = lines.filter((l) => l.quantityReceived > 0);

    // Persist the receipt record FIRST, then apply inventory — "already
    // received" tracking (alreadyReceivedMap above) is derived entirely from
    // goods_receipts rows, so if inventory were applied first and this insert
    // then failed, the increments would already be live with no receipt row
    // to show for it; retrying the same submission would double-increment
    // inventory with no way to tell. Applying inventory second means a
    // failure there instead rolls back the just-created receipt (below), so
    // there's never a receipt with no matching inventory change or vice versa.
    let receipt: Awaited<ReturnType<typeof createReceipt>>;
    try {
      receipt = await createReceipt({
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
        lines: linesToReceive.map((l) => ({
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
      });
    } catch (err) {
      toast.error(`Failed to record receipt: ${errMsg(err)}`);
      return;
    }

    setApplyingInventory(true);
    // Tracks which lines' inventory RPCs already succeeded in this submission
    // so a later line's failure can reverse them — otherwise a partial failure
    // mid-loop would leave earlier lines' increments applied with no receipt
    // surviving to account for them, and retrying the submission would then
    // double-increment inventory.
    const succeeded: Array<{ productId: string; partId: string | null; quantity: number }> = [];
    try {
      for (const line of linesToReceive) {
        // Find the PO line item to look up the productItemId
        const poLineItem = po.lineItems.find((li) => li.id === line.lineItemId);
        const matchedProduct = poLineItem ? matchProductForLine(poLineItem) : null;

        if (!matchedProduct) {
          throw new Error(`No catalog product found for "${line.productItemName}" — cannot update inventory for this line.`);
        }

        let linkedPartId: string | null = null;
        if (matchedProduct.category === "maintenance_part") {
          // Also update the Parts inventory record if one is linked
          const linkedPart = parts.find((pt) => pt.productItemId === matchedProduct.id) ??
            (line.partNumber ? parts.find((pt) => pt.partNumber === line.partNumber) : null);
          if (linkedPart) {
            await receivePartLayer({
              partId: linkedPart.id,
              quantity: line.quantityReceived,
              unitCost: line.unitCost,
              receivedAt,
              poNumber: po.poNumber,
              poLineItemId: line.lineItemId,
            });
            linkedPartId = linkedPart.id;
          }
        }
        await receiveProductLayer({
          productId: matchedProduct.id,
          quantity: line.quantityReceived,
          unitCost: line.unitCost,
          receivedAt,
          poNumber: po.poNumber,
          poLineItemId: line.lineItemId,
        });
        succeeded.push({ productId: matchedProduct.id, partId: linkedPartId, quantity: line.quantityReceived });
      }
    } catch (err) {
      // Reverse the inventory adjustments that already succeeded earlier in
      // this same loop before rolling back the receipt, so the whole receipt
      // attempt is atomic — all-or-nothing — from the user's perspective.
      if (succeeded.length > 0) {
        const supabase = createClient();
        for (const applied of succeeded) {
          if (applied.partId) {
            const { error: partRevertErr } = await supabase.rpc("adjust_part_quantity", {
              p_org_id: po.orgId,
              p_part_id: applied.partId,
              p_delta: -applied.quantity,
              p_po_number: po.poNumber,
            });
            if (partRevertErr) {
              toast.error(`Failed to reverse part inventory during rollback: ${errMsg(partRevertErr)}. Please review this PO's receipts manually.`);
            }
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: prodRevertErr } = await (supabase.rpc as any)("adjust_product_item_quantity", {
            p_org_id: po.orgId,
            p_product_id: applied.productId,
            p_delta: -applied.quantity,
            p_reason: "Receipt submission failed partway through — reversing already-applied inventory",
          });
          if (prodRevertErr) {
            toast.error(`Failed to reverse product inventory during rollback: ${errMsg(prodRevertErr)}. Please review this PO's receipts manually.`);
          }
        }
      }
      setApplyingInventory(false);
      // Inventory never moved (now reversed above if it had), so the receipt
      // that says it did is now wrong — roll it back rather than leaving a
      // receipt on record with no matching inventory change (which
      // alreadyReceivedMap would then treat as real). The header delete
      // cascades to goods_receipt_lines, including any rows for lines that
      // succeeded before the failure.
      try {
        await deleteReceipt(receipt.id);
      } catch (cleanupErr) {
        toast.error(
          `Failed to update inventory: ${errMsg(err)} — additionally failed to roll back the receipt that was already recorded (${errMsg(cleanupErr)}). Please review this PO's receipts manually.`
        );
        return;
      }
      toast.error(`Failed to update inventory: ${errMsg(err)} — receipt was not recorded.`);
      return;
    }
    setApplyingInventory(false);
    setSubmitted(true);
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
          <div className="max-h-[60dvh] sm:max-h-[65vh] overflow-y-auto px-1">
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
                        <TableHead className="text-right">Already Rcvd</TableHead>
                        <TableHead className="w-28 text-right">Receiving Now</TableHead>
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
                            {(() => {
                              const already = alreadyReceivedMap.get(line.lineItemId) ?? 0;
                              return already > 0
                                ? <span className="font-medium text-emerald-700">{already}</span>
                                : <span className="text-slate-400">—</span>;
                            })()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              step={line.isMaintPart ? 1 : 0.01}
                              max={Math.max(0, line.quantityOrdered - (alreadyReceivedMap.get(line.lineItemId) ?? 0))}
                              className="h-8 w-20 text-right text-xs"
                              value={line.quantityReceived}
                              onChange={(e) =>
                                handleQtyChange(
                                  line.lineItemId,
                                  parseFloat(e.target.value) || 0
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
                {discountShare > 0 && (
                  <div className="flex justify-between py-0.5 text-slate-600">
                    <span>Discount (prorated)</span>
                    <span className="tabular-nums">-{formatCurrency(discountShare)}</span>
                  </div>
                )}
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Button type="submit" disabled={!isValid || saving || applyingInventory}>
              {applyingInventory ? "Updating inventory..." : saving ? "Saving..." : "Record Receipt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
