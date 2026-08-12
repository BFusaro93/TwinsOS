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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateEvent } from "@/lib/hooks/use-crm-automations";
import { useUsers } from "@/lib/hooks/use-users";
import type { CRMSequenceEvent } from "@/types/crm-automations";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: CRMSequenceEvent;
}

export function AlertEventDialog({ open, onOpenChange, event }: Props) {
  const updateEvent = useUpdateEvent();
  const { data: users } = useUsers();
  const c = event.config;
  const [message, setMessage] = useState<string>(c.message ?? "");
  const [alertType, setAlertType] = useState<string>(c.alert_type ?? "info");
  const [recipientUserIds, setRecipientUserIds] = useState<string[]>(c.recipient_user_ids ?? []);
  const [saving, setSaving] = useState(false);

  function toggleRecipient(userId: string) {
    setRecipientUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateEvent.mutateAsync({
        id: event.id,
        sequenceId: event.sequenceId,
        config: { message, alert_type: alertType, recipient_user_ids: recipientUserIds },
      });
      onOpenChange(false);
    } catch {
      toast.error("Failed to save alert event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alert Event</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Message</Label>
            <Textarea
              placeholder="Alert message…"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Alert Type</Label>
            <Select value={alertType} onValueChange={setAlertType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Alert</Label>
            <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border border-slate-200 p-2">
              {(users ?? []).length === 0 && (
                <p className="text-sm text-slate-400 italic">No users found.</p>
              )}
              {(users ?? []).map((u) => (
                <div key={u.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`alert-user-${u.id}`}
                    checked={recipientUserIds.includes(u.id)}
                    onCheckedChange={() => toggleRecipient(u.id)}
                  />
                  <Label htmlFor={`alert-user-${u.id}`} className="cursor-pointer font-normal">
                    {u.name}
                  </Label>
                </div>
              ))}
            </div>
            {recipientUserIds.length === 0 && (
              <p className="text-[11px] text-amber-600">Select at least one user to receive this alert.</p>
            )}
          </div>
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
