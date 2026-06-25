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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateEvent } from "@/lib/hooks/use-crm-automations";
import type { CRMSequenceEvent } from "@/types/crm-automations";

const UPDATE_FIELDS = [
  { value: "sales_person", label: "Sales person" },
  { value: "csr", label: "CSR (customer service rep)" },
  { value: "client_source", label: "Client source" },
  { value: "billing_term", label: "Billing term" },
  { value: "custom_field", label: "Custom field" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: CRMSequenceEvent;
}

export function UpdateEventDialog({ open, onOpenChange, event }: Props) {
  const updateEvent = useUpdateEvent();
  const [field, setField] = useState("sales_person");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setField(event.config.field ?? "sales_person");
      setValue(event.config.value ?? "");
    }
  }, [open, event]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateEvent.mutateAsync({
        id: event.id,
        sequenceId: event.sequenceId,
        config: { field, value },
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Update</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Field to update</Label>
            <Select value={field} onValueChange={setField}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UPDATE_FIELDS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>New value</Label>
            <Input
              placeholder="Enter the value to set…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!field || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
