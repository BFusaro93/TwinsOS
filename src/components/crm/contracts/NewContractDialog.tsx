"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateContract } from "@/lib/hooks/use-contracts";
import { toast } from "sonner";
import type { BillingFrequency } from "@/types/crm-invoices";

const BILLING_FREQUENCIES: { value: BillingFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-Weekly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "one_time", label: "One-Time" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onCreated?: () => void;
}

export function NewContractDialog({ open, onOpenChange, clientId, onCreated }: Props) {
  const createContract = useCreateContract();

  const [title, setTitle] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setIsPending(true);
    try {
      await createContract.mutateAsync({
        clientId,
        title: title.trim(),
        monthlyAmountCents: monthlyAmount ? Math.round(parseFloat(monthlyAmount) * 100) : 0,
        billingFrequency,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        isActive: true,
        autoGenerate: true,
      });
      toast.success("Contract created");
      onOpenChange(false);
      setTitle("");
      setMonthlyAmount("");
      setBillingFrequency("monthly");
      setStartDate(new Date().toISOString().slice(0, 10));
      setEndDate("");
      onCreated?.();
    } catch {
      toast.error("Failed to create contract");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Contract</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2026 Lawn Maintenance"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Amount ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={monthlyAmount}
                onChange={(e) => setMonthlyAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Billing Frequency</Label>
              <Select
                value={billingFrequency}
                onValueChange={(v) => setBillingFrequency(v as BillingFrequency)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Creating…" : "Create Contract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
