"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useOrgList } from "@/lib/hooks/use-org-lists";

interface Props {
  stage: "accepted" | "lost";
  open: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function WonLostReasonDialog({ stage, open, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState("");
  const { data: reasons = [] } = useOrgList("estimate_reasons");

  function handleConfirm() {
    if (!reason) return;
    onConfirm(reason);
    setReason("");
  }

  function handleCancel() {
    setReason("");
    onCancel();
  }

  const label = stage === "accepted" ? "Accepted" : "Lost";
  const colorClass = stage === "accepted" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as {label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reason-select">Reason <span className="text-red-500">*</span></Label>
            {reasons.length > 0 ? (
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="reason-select">
                  <SelectValue placeholder="Select a reason…" />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r.id} value={r.value}>{r.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-slate-500">
                No reasons configured.{" "}
                <a href="/crm/settings?tab=estimates" className="text-brand-600 underline">
                  Add reasons in Settings
                </a>
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button
            disabled={!reason}
            className={colorClass + " text-white"}
            onClick={handleConfirm}
          >
            Mark as {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
