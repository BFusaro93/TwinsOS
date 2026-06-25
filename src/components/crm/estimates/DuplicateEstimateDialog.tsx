"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { toast } from "sonner";
import { useDuplicateEstimate } from "@/lib/hooks/use-estimates";

interface Props {
  estimateId: string;
  estimateDescription: string;
  open: boolean;
  onSuccess?: (newId: string) => void;
  onCancel: () => void;
}

export function DuplicateEstimateDialog({
  estimateId,
  estimateDescription,
  open,
  onSuccess,
  onCancel,
}: Props) {
  const router = useRouter();
  const [description, setDescription] = useState(`${estimateDescription} (Copy)`);
  const [resetStatus, setResetStatus] = useState(true);
  const duplicate = useDuplicateEstimate();

  function handleOpen(o: boolean) {
    if (o) setDescription(`${estimateDescription} (Copy)`);
    else onCancel();
  }

  async function handleConfirm() {
    try {
      const result = await duplicate.mutateAsync({ id: estimateId, description, resetStatus });
      toast.success("Estimate duplicated");
      onSuccess?.(result.id);
      router.push(`/crm/estimates/${result.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to duplicate");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Duplicate Estimate</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="dup-desc">New Description</Label>
            <Input
              id="dup-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="reset-status"
              checked={resetStatus}
              onCheckedChange={(v) => setResetStatus(v === true)}
            />
            <Label htmlFor="reset-status" className="cursor-pointer font-normal">
              Reset line item statuses to <strong>Quote</strong>
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!description.trim() || duplicate.isPending}
          >
            {duplicate.isPending ? "Copying…" : "Copy Estimate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
