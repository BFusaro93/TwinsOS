"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreatePMSchedulePause } from "@/lib/hooks/use-pm-schedule-pauses";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import { formatDate } from "@/lib/utils";

interface PausePMScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pmScheduleId: string;
  scheduleTitle: string;
}

export function PausePMScheduleDialog({ open, onOpenChange, pmScheduleId, scheduleTitle }: PausePMScheduleDialogProps) {
  const { today } = useOrgDates();
  const [startsOn, setStartsOn] = useState("");
  const [resumesOn, setResumesOn] = useState("");
  const [untilResumed, setUntilResumed] = useState(false);
  const [recursYearly, setRecursYearly] = useState(false);
  const [reason, setReason] = useState("");
  const createPause = useCreatePMSchedulePause();

  useEffect(() => {
    if (open) {
      setStartsOn(today());
      setResumesOn("");
      setUntilResumed(false);
      setRecursYearly(false);
      setReason("");
    }
  }, [open, today]);

  const error =
    !startsOn ? "Pick the day the pause starts." :
    !untilResumed && !resumesOn ? "Pick a resume date, or choose “Until I resume it”." :
    !untilResumed && resumesOn <= startsOn ? "The resume date has to be after the start date." :
    recursYearly && !untilResumed && Date.parse(resumesOn) - Date.parse(startsOn) > 366 * 86400000
      ? "A yearly pause can't be longer than a year." :
    // Same month/day start and end would wrap to cover the whole year, every
    // year (the database rejects it too).
    recursYearly && !untilResumed && resumesOn.slice(5) === startsOn.slice(5)
      ? "A yearly pause has to resume on a different day of the year than it starts." : null;

  function handleSave() {
    if (error) return;
    createPause.mutate(
      {
        pmScheduleId,
        startsOn,
        resumesOn: untilResumed ? null : resumesOn,
        recursYearly: !untilResumed && recursYearly,
        reason: reason.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(`${scheduleTitle} paused`);
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't pause the schedule"),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Pause PM Schedule</DialogTitle>
          <DialogDescription>
            While paused, no PMs come due: nothing is generated, nothing is overdue, and those cycles don&apos;t count against PM compliance.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pause-starts">Pause Starts</Label>
              <Input id="pause-starts" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pause-resumes">Resumes On</Label>
              <Input
                id="pause-resumes"
                type="date"
                value={untilResumed ? "" : resumesOn}
                disabled={untilResumed}
                onChange={(e) => setResumesOn(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-neutral-300">
            <Checkbox
              checked={untilResumed}
              onCheckedChange={(v) => {
                setUntilResumed(v === true);
                if (v === true) setRecursYearly(false);
              }}
            />
            Until I resume it
          </label>

          <label className={`flex items-start gap-2 text-sm ${untilResumed ? "text-slate-400 dark:text-neutral-500" : "text-slate-700 dark:text-neutral-300"}`}>
            <Checkbox
              checked={recursYearly}
              disabled={untilResumed}
              onCheckedChange={(v) => setRecursYearly(v === true)}
              className="mt-0.5"
            />
            <span>
              Repeat every year
              {recursYearly && startsOn && resumesOn && !untilResumed && (
                <span className="block text-xs text-muted-foreground">
                  Paused {formatDate(startsOn).replace(/, \d{4}$/, "")} → {formatDate(resumesOn).replace(/, \d{4}$/, "")} each year, e.g. mowers over winter.
                </span>
              )}
            </span>
          </label>

          <div className="grid gap-1.5">
            <Label htmlFor="pause-reason">Reason</Label>
            <Input id="pause-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Off-season — mowers stored" />
          </div>

          {error && startsOn && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={!!error || createPause.isPending} onClick={handleSave}>
            {createPause.isPending ? "Pausing…" : "Pause Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
