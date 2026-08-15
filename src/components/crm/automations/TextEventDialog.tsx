"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useUpdateEvent } from "@/lib/hooks/use-crm-automations";
import type { CRMSequenceEvent } from "@/types/crm-automations";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: CRMSequenceEvent;
}

const TO_OPTIONS = [
  { value: "client_primary_phone", label: "Client primary phone" },
  { value: "billing_phone", label: "Billing contact phone" },
  { value: "all_contacts", label: "All contacts (ok to text)" },
];

const MAX_CHARS = 160;

export function TextEventDialog({ open, onOpenChange, event }: Props) {
  const updateEvent = useUpdateEvent();
  const c = event.config;
  const [message, setMessage] = useState<string>(c.message ?? "");
  const [to, setTo] = useState<string[]>(c.to ?? ["client_primary_phone"]);
  const [requireApproval, setRequireApproval] = useState<boolean>(c.require_approval ?? false);
  const [saving, setSaving] = useState(false);

  function toggleTo(value: string) {
    setTo((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateEvent.mutateAsync({
        id: event.id,
        sequenceId: event.sequenceId,
        config: { message, to, require_approval: requireApproval },
      });
      onOpenChange(false);
    } catch {
      toast.error("Failed to save text message event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Text Message Event</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label>Message</Label>
              <span
                className={`text-[11px] ${message.length > MAX_CHARS ? "text-red-500" : "text-slate-400"}`}
              >
                {message.length}/{MAX_CHARS}
              </span>
            </div>
            <Textarea
              placeholder="SMS message…"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Send To</Label>
            {TO_OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <Checkbox
                  id={`text-to-${opt.value}`}
                  checked={to.includes(opt.value)}
                  onCheckedChange={() => toggleTo(opt.value)}
                />
                <Label htmlFor={`text-to-${opt.value}`} className="cursor-pointer font-normal">
                  {opt.label}
                </Label>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="text-require-approval"
              checked={requireApproval}
              onCheckedChange={setRequireApproval}
            />
            <Label htmlFor="text-require-approval" className="cursor-pointer">
              Require approval before sending
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || message.length > MAX_CHARS}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
