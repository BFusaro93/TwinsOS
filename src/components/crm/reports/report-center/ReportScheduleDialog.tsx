"use client";

import { useState } from "react";
import { CalendarClock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateReportSchedule,
  useDeleteReportSchedule,
  useReportSchedules,
  useUpdateReportSchedule,
} from "@/lib/hooks/use-report-schedules";

function parseEmails(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Hour-of-day options (America/New_York) for the schedule's send time. */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: new Date(2000, 0, 1, hour).toLocaleTimeString("en-US", { hour: "numeric", hour12: true }),
}));

/** "Schedule" button + dialog for a schedulable report — lets a user set up
 *  (or manage existing) daily email delivery of that report as a PDF. */
export function ReportScheduleDialog({ reportKey, reportName }: { reportKey: string; reportName: string }) {
  const [open, setOpen] = useState(false);
  const [recipientsText, setRecipientsText] = useState("");
  const [hourLocal, setHourLocal] = useState(7);

  const { data: allSchedules } = useReportSchedules();
  const schedules = (allSchedules ?? []).filter((s) => s.report_key === reportKey);

  const createSchedule = useCreateReportSchedule();
  const updateSchedule = useUpdateReportSchedule();
  const deleteSchedule = useDeleteReportSchedule();

  const handleCreate = () => {
    const recipients = parseEmails(recipientsText);
    if (recipients.length === 0) {
      toast.error("Enter at least one email address.");
      return;
    }
    createSchedule.mutate(
      { reportKey, recipients, hourLocal },
      {
        onSuccess: () => {
          setRecipientsText("");
          toast.success("Scheduled — this report will email daily.");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to schedule"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
          Schedule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule &quot;{reportName}&quot;</DialogTitle>
          <DialogDescription>
            Emails a PDF of this report daily to the addresses below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {schedules.length > 0 && (
            <div className="space-y-2">
              {schedules.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-700">{s.recipients.join(", ")}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {s.last_run_status && (
                        <Badge variant={s.last_run_status === "success" ? "secondary" : "destructive"} className="text-[10px]">
                          {s.last_run_status === "success" ? "Last sent OK" : "Last run failed"}
                        </Badge>
                      )}
                      {s.last_run_at && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(s.last_run_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={String(s.hour_local)}
                      onValueChange={(value) => updateSchedule.mutate({ id: s.id, hourLocal: Number(value) })}
                    >
                      <SelectTrigger className="h-7 w-[92px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOUR_OPTIONS.map((h) => (
                          <SelectItem key={h.value} value={String(h.value)}>
                            {h.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Switch
                      checked={s.enabled}
                      onCheckedChange={(enabled) => updateSchedule.mutate({ id: s.id, enabled })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => deleteSchedule.mutate(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Add recipients (comma or newline separated)</label>
            <Textarea
              rows={3}
              placeholder="you@company.com, ops@company.com"
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Send time</label>
            <Select value={String(hourLocal)} onValueChange={(value) => setHourLocal(Number(value))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map((h) => (
                  <SelectItem key={h.value} value={String(h.value)}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleCreate} disabled={createSchedule.isPending}>
            {createSchedule.isPending ? "Saving…" : "Add Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
