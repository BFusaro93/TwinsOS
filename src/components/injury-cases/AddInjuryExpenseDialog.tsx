"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateInjuryCaseExpense } from "@/lib/hooks/use-injury-cases";
import { useVendors } from "@/lib/hooks/use-vendors";
import { VendorCombobox } from "@/components/shared/VendorCombobox";
import { INJURY_EXPENSE_TYPE_LABELS } from "@/lib/constants";
import type { InjuryExpenseType } from "@/types";

interface Props {
  injuryCaseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddInjuryExpenseDialog({ injuryCaseId, open, onOpenChange }: Props) {
  const [expenseDate, setExpenseDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [expenseType, setExpenseType] = useState<InjuryExpenseType>("medical");
  const [vendorId, setVendorId] = useState("none");
  const [vendorName, setVendorName] = useState("");
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const { data: vendors = [] } = useVendors();
  const createExpense = useCreateInjuryCaseExpense();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const selectedVendor = vendors.find((v) => v.id === vendorId);
    try {
      await createExpense.mutateAsync({
        injuryCaseId,
        expenseDate,
        expenseType,
        vendorId: vendorId !== "none" ? vendorId : null,
        vendorName: selectedVendor?.name ?? (vendorName.trim() || null),
        description: description.trim(),
        amount: Math.round((parseFloat(amountStr) || 0) * 100),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add expense");
      return;
    }
    onOpenChange(false);
    setExpenseType("medical");
    setVendorId("none");
    setVendorName("");
    setDescription("");
    setAmountStr("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={expenseType} onValueChange={(v) => setExpenseType(v as InjuryExpenseType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INJURY_EXPENSE_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Vendor / Provider <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <VendorCombobox vendors={vendors} value={vendorId} onValueChange={setVendorId} noneLabel="— None —" />
            {vendorId === "none" && (
              <Input className="mt-1.5" placeholder="Or type a clinic / provider name…" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="e.g. Urgent care visit, prescription" />
          </div>
          <div className="space-y-1.5">
            <Label>Amount ($)</Label>
            <Input type="number" min="0" step="0.01" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} required placeholder="0.00" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createExpense.isPending}>{createExpense.isPending ? "Saving…" : "Add Expense"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
