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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { LineItemStatus } from "@/types/crm-estimates";

const STATUS_OPTIONS: { value: LineItemStatus; label: string; color: string }[] = [
  { value: "draft", label: "Draft", color: "bg-slate-100 text-slate-600" },
  { value: "quote", label: "Quote", color: "bg-blue-100 text-blue-700" },
  { value: "won",   label: "Won",   color: "bg-green-100 text-green-700" },
  { value: "lost",  label: "Lost",  color: "bg-red-100 text-red-600" },
];

interface Props {
  selectedCount: number;
  open: boolean;
  onApply: (status: LineItemStatus) => void;
  onCancel: () => void;
}

export function BulkStatusDialog({ selectedCount, open, onApply, onCancel }: Props) {
  const [status, setStatus] = useState<LineItemStatus | "">("");

  function handleApply() {
    if (!status) return;
    onApply(status);
    setStatus("");
  }

  function handleCancel() {
    setStatus("");
    onCancel();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Status</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-status-select">New status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as LineItemStatus)}>
              <SelectTrigger id="bulk-status-select" className="h-9">
                <SelectValue placeholder="Select a status…" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", opt.color)}>
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-slate-500">
            Applies to {selectedCount} selected line item{selectedCount !== 1 ? "s" : ""}.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button disabled={!status} onClick={handleApply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
