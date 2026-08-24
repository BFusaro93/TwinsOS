"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateDamageCaseExpense } from "@/lib/hooks/use-damage-cases";
import { useVendors } from "@/lib/hooks/use-vendors";
import { VendorCombobox } from "@/components/shared/VendorCombobox";

interface Props {
  damageCaseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddExpenseDialog({ damageCaseId, open, onOpenChange }: Props) {
  const [expenseDate, setExpenseDate] = useState("");
  const [vendorId, setVendorId] = useState<string>("none");
  const [vendorName, setVendorName] = useState("");
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const { data: vendors = [] } = useVendors();
  const createExpense = useCreateDamageCaseExpense();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dollars = parseFloat(amountStr) || 0;
    const selectedVendor = vendors.find((v) => v.id === vendorId);
    try {
      await createExpense.mutateAsync({
        damageCaseId,
        expenseDate,
        vendorId: vendorId !== "none" ? vendorId : null,
        vendorName: selectedVendor?.name ?? (vendorName || null),
        description,
        amount: Math.round(dollars * 100),
        purchaseOrderId: null,
      });
    } catch {
      toast.error("Failed to add expense");
      return;
    }
    onOpenChange(false);
    setExpenseDate("");
    setVendorId("none");
    setVendorName("");
    setDescription("");
    setAmountStr("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Vendor</Label>
            <VendorCombobox
              vendors={vendors}
              value={vendorId}
              onValueChange={setVendorId}
              noneLabel="— None —"
            />
            {vendorId === "none" && (
              <Input
                className="mt-1.5"
                placeholder="Or type vendor name…"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Description / Supplies</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="e.g. Repair damaged corner siding" />
          </div>
          <div className="space-y-1.5">
            <Label>Amount ($)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              required
              placeholder="0.00"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createExpense.isPending}>
              {createExpense.isPending ? "Saving…" : "Add Expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
