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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { useUpdateGoodsReceipt } from "@/lib/hooks/use-goods-receipts";
import type { GoodsReceipt } from "@/types";

interface NewReceivingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: GoodsReceipt | null;
  /** Called with each line's PO line item id + this receipt's (possibly
   *  just-edited) quantityReceived, so the caller can check the PO's true
   *  CUMULATIVE received total across every receipt — a single receipt's
   *  own quantityReceived is only ever this receipt's own contribution,
   *  not the whole PO's status. */
  onReceiptEdit?: (lines: { lineItemId: string | null; quantityReceived: number }[]) => void;
}

export function NewReceivingDialog({ open, onOpenChange, initialData, onReceiptEdit }: NewReceivingDialogProps) {
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<
    Array<{
      id: string;
      lineItemId: string | null;
      productItemName: string;
      partNumber: string;
      quantityOrdered: number;
      quantityReceived: number;
      unitCost: number;
      isMaintPart: boolean;
    }>
  >([]);
  const updateGoodsReceipt = useUpdateGoodsReceipt();

  useEffect(() => {
    if (open && initialData) {
      setNotes(initialData.notes ?? "");
      setLines(
        initialData.lines.map((l) => ({
          id: l.id,
          lineItemId: l.lineItemId,
          productItemName: l.productItemName,
          partNumber: l.partNumber,
          quantityOrdered: l.quantityOrdered,
          quantityReceived: l.quantityReceived,
          unitCost: l.unitCost,
          isMaintPart: l.isMaintPart,
        }))
      );
    }
  }, [open, initialData]);

  function handleQtyChange(id: string, qty: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        // Maintenance parts are discrete units (can't receive 3.5 oil filters);
        // materials (mulch, chemicals, etc.) are legitimately fractional.
        const normalized = l.isMaintPart ? Math.round(qty) : Math.round(qty * 100) / 100;
        return { ...l, quantityReceived: Math.max(0, Math.min(normalized, l.quantityOrdered)) };
      })
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!initialData) return;
    updateGoodsReceipt.mutate(
      {
        id: initialData.id,
        notes: notes || null,
        lines: lines.map((l) => ({ id: l.id, productItemName: l.productItemName, quantityReceived: l.quantityReceived, quantityOrdered: l.quantityOrdered, unitCost: l.unitCost })),
      },
      {
        onSuccess: () => {
          onReceiptEdit?.(lines.map((l) => ({ lineItemId: l.lineItemId, quantityReceived: l.quantityReceived })));
          onOpenChange(false);
        },
      }
    );
  }
  const saving = updateGoodsReceipt.isPending;

  if (!initialData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Receipt — {initialData.receiptNumber}</DialogTitle>
          <DialogDescription>Correct received quantities or update notes.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="max-h-[60vh] overflow-y-auto space-y-4 pb-2">
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 text-xs">
                    <TableHead>Item</TableHead>
                    <TableHead>Part #</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="w-24 text-right">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id} className="text-sm">
                      <TableCell className="font-medium">{line.productItemName}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">
                        {line.partNumber || "—"}
                      </TableCell>
                      <TableCell className="text-right text-slate-600">
                        {formatCurrency(line.unitCost)}
                      </TableCell>
                      <TableCell className="text-right">{line.quantityOrdered}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          step={line.isMaintPart ? 1 : 0.01}
                          max={line.quantityOrdered}
                          className="h-8 w-20 text-right text-xs"
                          value={line.quantityReceived}
                          onChange={(e) =>
                            handleQtyChange(line.id, parseFloat(e.target.value) || 0)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="recv-edit-notes">Notes</Label>
              <Textarea
                id="recv-edit-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Condition of goods, backorder notes, etc."
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
