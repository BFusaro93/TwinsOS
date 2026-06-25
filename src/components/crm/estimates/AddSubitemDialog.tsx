"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useUpsertSubitem,
  type LineItemSubitem,
} from "@/lib/hooks/use-line-item-subitems";

interface Props {
  lineItemId: string;
  subitem?: LineItemSubitem;
  open: boolean;
  onClose: () => void;
}

interface FormState {
  name: string;
  type: "product" | "subservice";
  qty: number;
  rateDollars: number;
  costDollars: number;
  confirmQty: boolean;
  invoice: boolean;
  printOnInvoice: boolean;
  createInstalledProduct: boolean;
}

function getInitialState(subitem?: LineItemSubitem): FormState {
  if (subitem) {
    return {
      name: subitem.name,
      type: subitem.type,
      qty: subitem.qty,
      rateDollars: subitem.rateCents / 100,
      costDollars: subitem.costCents / 100,
      confirmQty: subitem.confirmQty,
      invoice: subitem.invoice,
      printOnInvoice: subitem.printOnInvoice,
      createInstalledProduct: subitem.createInstalledProduct,
    };
  }
  return {
    name: "",
    type: "product",
    qty: 1,
    rateDollars: 0,
    costDollars: 0,
    confirmQty: false,
    invoice: false,
    printOnInvoice: false,
    createInstalledProduct: false,
  };
}

export function AddSubitemDialog({ lineItemId, subitem, open, onClose }: Props) {
  const [form, setForm] = useState<FormState>(() => getInitialState(subitem));
  const { mutateAsync: upsert, isPending } = useUpsertSubitem();

  // Reset when dialog opens/closes or subitem changes
  useEffect(() => {
    if (open) {
      setForm(getInitialState(subitem));
    }
  }, [open, subitem]);

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  const totalCents = Math.round(form.qty * form.rateDollars * 100);

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      await upsert({
        lineItemId,
        item: {
          ...(subitem ? { id: subitem.id } : {}),
          type: form.type,
          name: form.name.trim(),
          qty: form.qty,
          rateCents: Math.round(form.rateDollars * 100),
          costCents: Math.round(form.costDollars * 100),
          totalCents,
          confirmQty: form.confirmQty,
          invoice: form.invoice,
          printOnInvoice: form.printOnInvoice,
          createInstalledProduct: form.createInstalledProduct,
          sortOrder: subitem?.sortOrder ?? 0,
        },
      });
      onClose();
    } catch {
      toast.error("Failed to save sub-item");
    }
  }

  const isEdit = !!subitem;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Sub-Item" : "Add Sub-Item"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="subitem-name">Name <span className="text-red-500">*</span></Label>
            <Input
              id="subitem-name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Mulch, Fertilizer, Subcontractor"
              autoFocus
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setField("type", v as "product" | "subservice")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="subservice">Subservice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Qty + Rate + Cost in a row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subitem-qty">Qty</Label>
              <Input
                id="subitem-qty"
                type="number"
                min={0}
                step="any"
                value={form.qty || ""}
                onChange={(e) => setField("qty", Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subitem-rate">Rate ($)</Label>
              <Input
                id="subitem-rate"
                type="number"
                min={0}
                step="0.01"
                value={form.rateDollars || ""}
                onChange={(e) => setField("rateDollars", Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subitem-cost">Cost ($)</Label>
              <Input
                id="subitem-cost"
                type="number"
                min={0}
                step="0.01"
                value={form.costDollars || ""}
                onChange={(e) => setField("costDollars", Number(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Total read-only */}
          <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">Total</span>
            <span className="font-semibold text-slate-900">
              ${(totalCents / 100).toFixed(2)}
            </span>
          </div>

          {/* Checkboxes — 2×2 grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="subitem-confirmQty"
                checked={form.confirmQty}
                onCheckedChange={(v) => setField("confirmQty", !!v)}
              />
              <Label htmlFor="subitem-confirmQty" className="cursor-pointer text-sm font-normal">
                Confirm Qty
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="subitem-invoice"
                checked={form.invoice}
                onCheckedChange={(v) => setField("invoice", !!v)}
              />
              <Label htmlFor="subitem-invoice" className="cursor-pointer text-sm font-normal">
                Invoice
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="subitem-printOnInvoice"
                checked={form.printOnInvoice}
                onCheckedChange={(v) => setField("printOnInvoice", !!v)}
              />
              <Label htmlFor="subitem-printOnInvoice" className="cursor-pointer text-sm font-normal">
                Print on Invoice
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="subitem-createInstalledProduct"
                checked={form.createInstalledProduct}
                onCheckedChange={(v) => setField("createInstalledProduct", !!v)}
              />
              <Label htmlFor="subitem-createInstalledProduct" className="cursor-pointer text-sm font-normal">
                Create Installed Product
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Sub-Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
