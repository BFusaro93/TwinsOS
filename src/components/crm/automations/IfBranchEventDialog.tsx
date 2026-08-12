"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useUpdateEvent } from "@/lib/hooks/use-crm-automations";
import { ConditionListEditor, type ConditionRow } from "./ConditionListEditor";
import type { CRMSequenceEvent } from "@/types/crm-automations";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: CRMSequenceEvent;
}

export function IfBranchEventDialog({ open, onOpenChange, event }: Props) {
  const updateEvent = useUpdateEvent();
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setConditions((event.config.conditions ?? []) as ConditionRow[]);
    }
  }, [open, event]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateEvent.mutateAsync({
        id: event.id,
        sequenceId: event.sequenceId,
        config: { conditions },
      });
      onOpenChange(false);
    } catch {
      toast.error("Failed to save IF branch");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit IF Branch</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-slate-500">
          Events nested under this IF block only run when ALL conditions below are met. If no conditions are met, clients skip the IF block and continue in the sequence.
        </p>

        <div className="flex flex-col gap-2">
          <Label>Conditions</Label>
          <ConditionListEditor
            conditions={conditions}
            onChange={setConditions}
            joinLabel="AND"
            emptyLabel="No conditions — all clients will follow this branch."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
