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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateEvent } from "@/lib/hooks/use-crm-automations";
import type { CRMSequenceEvent } from "@/types/crm-automations";
import { toast } from "sonner";
import { mutationErrorMessage } from "@/lib/utils/mutation-error";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: CRMSequenceEvent;
}

export function WaitEventDialog({ open, onOpenChange, event }: Props) {
  const updateEvent = useUpdateEvent();
  const [days, setDays] = useState<number>(event.config.days ?? 0);
  const [hours, setHours] = useState<number>(event.config.hours ?? 0);
  const [minutes, setMinutes] = useState<number>(event.config.minutes ?? 0);
  const [untilTime, setUntilTime] = useState<string>(event.config.until_time ?? "");
  const [weekdaysOnly, setWeekdaysOnly] = useState<boolean>(event.config.weekdays_only === true);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateEvent.mutateAsync({
        id: event.id,
        sequenceId: event.sequenceId,
        config: {
          days, hours, minutes,
          ...(untilTime ? { until_time: untilTime } : {}),
          ...(weekdaysOnly ? { weekdays_only: true } : {}),
        },
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Failed to save wait event"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Wait Event</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <p className="text-sm text-muted-foreground">
            Pause the sequence for the specified duration before proceeding to the next event.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Days</Label>
              <Input
                type="number"
                min={0}
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Hours</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={hours}
                onChange={(e) => setHours(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Minutes</Label>
              <Input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => setMinutes(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wait-until-time">Then wait until (optional)</Label>
            <Input
              id="wait-until-time"
              type="time"
              value={untilTime}
              onChange={(e) => setUntilTime(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              After the delay, hold until the next time your company clock reads this — e.g. wait 1 day, then continue at 9:00 AM.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={weekdaysOnly}
              onChange={(e) => setWeekdaysOnly(e.target.checked)}
            />
            Weekdays only (a Saturday or Sunday result moves to Monday)
          </label>
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
