"use client";

import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { useVendors } from "@/lib/hooks/use-vendors";
import { useProducts } from "@/lib/hooks/use-products";
import { useParts } from "@/lib/hooks/use-parts";
import { useCreatePurchaseOrder } from "@/lib/hooks/use-purchase-orders";
import type { Requisition, LineItem, PurchaseOrder } from "@/types";

interface SplitToPOsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requisition: Requisition;
  onCreated: (pos: PurchaseOrder[]) => void;
}

interface Assignment {
  lineItem: LineItem;
  vendorId: string;
  vendorName: string;
}

function resolveVendor(
  lineItem: LineItem,
  products: { id: string; vendorId: string; vendorName: string }[],
  parts: { id: string; vendorId: string | null; vendorName: string | null }[]
): { vendorId: string; vendorName: string } {
  const raw = lineItem.productItemId ?? "";
  const isPartKey = raw.startsWith("part:");
  const bareId = raw.replace(/^(product:|part:)/, "");

  if (isPartKey) {
    const part = parts.find((p) => p.id === bareId);
    if (part?.vendorId) return { vendorId: part.vendorId, vendorName: part.vendorName ?? "" };
  } else {
    const prod = products.find((p) => p.id === bareId);
    if (prod?.vendorId) return { vendorId: prod.vendorId, vendorName: prod.vendorName };
  }
  return { vendorId: "none", vendorName: "" };
}

export function SplitToPOsDialog({
  open,
  onOpenChange,
  requisition,
  onCreated,
}: SplitToPOsDialogProps) {
  const { data: vendors = [] } = useVendors();
  const { data: products = [] } = useProducts();
  const { data: parts = [] } = useParts();
  const { mutateAsync: createPO } = useCreatePurchaseOrder();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [creating, setCreating] = useState(false);

  // Initialise assignments whenever dialog opens
  useEffect(() => {
    if (!open) return;
    setAssignments(
      requisition.lineItems.map((li) => {
        const resolved = resolveVendor(li, products, parts);
        return { lineItem: li, ...resolved };
      })
    );
  }, [open, requisition.lineItems, products, parts]);

  function setVendor(lineItemId: string, vendorId: string) {
    const vendor = vendors.find((v) => v.id === vendorId);
    setAssignments((prev) =>
      prev.map((a) =>
        a.lineItem.id === lineItemId
          ? { ...a, vendorId, vendorName: vendor?.name ?? "" }
          : a
      )
    );
  }

  // Group assignments by vendor
  const groups = assignments.reduce<
    Record<string, { vendorId: string; vendorName: string; items: Assignment[] }>
  >((acc, a) => {
    const key = a.vendorId;
    if (!acc[key]) acc[key] = { vendorId: a.vendorId, vendorName: a.vendorName, items: [] };
    acc[key].items.push(a);
    return acc;
  }, {});

  const groupList = Object.values(groups);
  const hasUnassigned = assignments.some((a) => a.vendorId === "none");
  const poCount = groupList.filter((g) => g.vendorId !== "none").length +
    (hasUnassigned ? 1 : 0);

  async function handleCreate() {
    setCreating(true);
    const now = new Date().toISOString();
    const created: PurchaseOrder[] = [];
    const base = Date.now();

    try {
      for (let i = 0; i < groupList.length; i++) {
        const group = groupList[i];
        const lineItems = group.items.map((a) => a.lineItem);
        const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.unitCost, 0);
        const salesTax = Math.round((subtotal * requisition.taxRatePercent) / 100);
        const grandTotal = subtotal + salesTax;

        const result = await createPO({
          poNumber: `PO-${new Date().getFullYear()}-${String(base).slice(-6)}-${i + 1}`,
          poDate: now.split("T")[0],
          invoiceNumber: null,
          status: "requested",
          vendorId: group.vendorId === "none" ? "" : group.vendorId,
          vendorName: group.vendorId === "none" ? "Unassigned" : group.vendorName,
          lineItems,
          subtotal,
          taxRatePercent: requisition.taxRatePercent,
          salesTax,
          shippingCost: 0,
          grandTotal,
          requisitionId: requisition.id,
          paymentSubmittedToAP: false,
          paymentRemitted: false,
          paymentType: null,
          paymentBookedInQB: false,
          notes: null,
        });

        created.push(result);
      }

      onCreated(created);
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Split into Purchase Orders by Vendor</DialogTitle>
          <DialogDescription>
            Assign each line item to a vendor. One PO will be created per
            unique vendor.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60dvh] sm:max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="pb-2 pr-3 font-medium">Item</th>
                <th className="w-16 pb-2 pr-3 font-medium text-right">Qty</th>
                <th className="w-24 pb-2 pr-3 font-medium text-right">Unit Cost</th>
                <th className="w-48 pb-2 font-medium">Vendor</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.lineItem.id} className="border-b">
                  <td className="py-2 pr-3 align-top">
                    <p className="font-medium text-slate-900">
                      {a.lineItem.productItemName}
                    </p>
                    {a.lineItem.partNumber && (
                      <p className="text-xs text-slate-400">#{a.lineItem.partNumber}</p>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right align-top tabular-nums">
                    {a.lineItem.quantity}
                  </td>
                  <td className="py-2 pr-3 text-right align-top tabular-nums">
                    {formatCurrency(a.lineItem.unitCost)}
                  </td>
                  <td className="py-2 align-top">
                    <Select
                      value={a.vendorId}
                      onValueChange={(val) => setVendor(a.lineItem.id, val)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select vendor…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs text-slate-400">
                          Unassigned
                        </SelectItem>
                        {vendors.map((v) => (
                          <SelectItem key={v.id} value={v.id} className="text-xs">
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PO preview */}
        <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">
            Will create {poCount} Purchase Order{poCount !== 1 ? "s" : ""}:
          </p>
          <div className="flex flex-wrap gap-2">
            {groupList.map((g) => (
              <Badge
                key={g.vendorId}
                variant={g.vendorId === "none" ? "destructive" : "outline"}
                className="text-xs"
              >
                {g.vendorId === "none" ? "Unassigned" : g.vendorName} ·{" "}
                {g.items.length} item{g.items.length !== 1 ? "s" : ""}
              </Badge>
            ))}
          </div>
          {hasUnassigned && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
              <AlertCircle className="h-3.5 w-3.5" />
              Unassigned items will create a PO with no vendor — assign vendors to avoid this.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={creating || assignments.length === 0}
            onClick={handleCreate}
          >
            {creating
              ? "Creating…"
              : `Create ${poCount} Purchase Order${poCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
