"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import {
  useCreateReportSchedule,
  useUpdateReportSchedule,
  type ReportSchedule,
} from "@/lib/hooks/use-report-schedules";
import { ALL_REPORTS, getReport } from "@/lib/reports/registry";
import {
  describeRecurrence,
  formatHour,
  MONTH_WEEKS,
  normalizeRecurrence,
  recurrenceFromRow,
  recurrenceProblem,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  weekdayOfYmd,
  type MonthlyMode,
  type MonthWeek,
  type ScheduleFrequency,
  type ScheduleRecurrence,
} from "@/lib/reports/schedule-recurrence";
import { todayInZone } from "@/lib/time/zone";
import type { ScheduleFormat } from "@/types/report-schedules";

function parseEmails(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({ value: hour, label: formatHour(hour) }));
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);
const WEEK_LABELS: Record<MonthWeek, string> = { 1: "First", 2: "Second", 3: "Third", 4: "Fourth", [-1]: "Last" };
const FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  once: "Once",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const SCHEDULABLE_REPORTS = ALL_REPORTS.filter((r) => r.schedulable);

interface FormState {
  reportKey: string;
  recipientsText: string;
  recurrence: ScheduleRecurrence;
  format: ScheduleFormat;
  emailSubject: string;
  emailMessage: string;
}

function initialState(schedule: ReportSchedule | null, reportKey: string | null, today: string): FormState {
  if (schedule) {
    const r = recurrenceFromRow(schedule);
    return {
      reportKey: schedule.report_key,
      recipientsText: schedule.recipients.join(", "),
      recurrence: {
        ...r,
        // Seed the other modes' pickers with sensible values so switching
        // frequency in the editor doesn't land on an empty, invalid rule.
        weekdays: r.weekdays.length ? r.weekdays : [weekdayOfYmd(today)],
        monthlyMode: r.monthlyMode ?? "day_of_month",
        monthDay: r.monthDay ?? 1,
        monthWeek: r.monthWeek ?? 1,
        monthWeekday: r.monthWeekday ?? 1,
      },
      format: schedule.format === "xlsx" ? "xlsx" : "pdf",
      emailSubject: schedule.email_subject ?? "",
      emailMessage: schedule.email_message ?? "",
    };
  }
  return {
    reportKey: reportKey ?? SCHEDULABLE_REPORTS[0]?.key ?? "",
    recipientsText: "",
    recurrence: {
      frequency: "daily",
      hourLocal: 7,
      weekdays: [weekdayOfYmd(today)],
      monthlyMode: "day_of_month",
      monthDay: 1,
      monthWeek: 1,
      monthWeekday: 1,
      startDate: today,
      endDate: null,
    },
    format: "pdf",
    emailSubject: "",
    emailMessage: "",
  };
}

/**
 * Create or edit one scheduled report delivery: what (report, PDF/Excel), to
 * whom, when (once / daily / weekly on chosen days / monthly by day-of-month
 * or nth weekday, between optional start and end dates, at an hour on the
 * ORG's clock), and the email's subject and message. Used by the report
 * page's Schedule button and the Report Center's Scheduled tab.
 *
 * The form is seeded once on mount — callers mount it only while open (and
 * key it by schedule id), so a background refetch can't wipe in-progress
 * edits.
 */
export function ReportScheduleEditorDialog({
  open,
  onOpenChange,
  schedule,
  reportKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing schedule to edit; null = create. */
  schedule: ReportSchedule | null;
  /** Fixed report for a new schedule (null = let the user pick). */
  reportKey: string | null;
}) {
  const timeZone = useOrgTimeZone();
  const today = todayInZone(timeZone);
  const [form, setForm] = useState<FormState>(() => initialState(schedule, reportKey, today));
  const createSchedule = useCreateReportSchedule();
  const updateSchedule = useUpdateReportSchedule();
  const saving = createSchedule.isPending || updateSchedule.isPending;

  const setRecurrence = (patch: Partial<ScheduleRecurrence>) =>
    setForm((f) => ({ ...f, recurrence: { ...f.recurrence, ...patch } }));

  const normalized = useMemo(() => normalizeRecurrence(form.recurrence), [form.recurrence]);
  const problem = recurrenceProblem(normalized);
  const summary = problem ? null : describeRecurrence(normalized, today);
  const reportName = getReport(form.reportKey)?.name ?? form.reportKey;

  const toggleWeekday = (day: number, checked: boolean) =>
    setRecurrence({
      weekdays: checked
        ? [...form.recurrence.weekdays, day]
        : form.recurrence.weekdays.filter((d) => d !== day),
    });

  const handleSave = () => {
    const recipients = parseEmails(form.recipientsText);
    if (recipients.length === 0) {
      toast.error("Enter at least one email address.");
      return;
    }
    if (problem) {
      toast.error(problem);
      return;
    }
    if (!form.reportKey) {
      toast.error("Pick a report.");
      return;
    }
    const payload = {
      hourLocal: normalized.hourLocal,
      frequency: normalized.frequency,
      weekdays: normalized.weekdays,
      monthlyMode: normalized.monthlyMode,
      monthDay: normalized.monthDay,
      monthWeek: normalized.monthWeek,
      monthWeekday: normalized.monthWeekday,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      format: form.format,
      emailSubject: form.emailSubject,
      emailMessage: form.emailMessage,
    };
    const callbacks = {
      onSuccess: () => {
        toast.success(schedule ? "Schedule updated." : "Scheduled.");
        onOpenChange(false);
      },
      onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Failed to save schedule"),
    };
    if (schedule) {
      // Only send recipients when they changed: a recipient change re-checks
      // that the editor can view the report, which a timing tweak shouldn't.
      const recipientsChanged = recipients.join("\n") !== schedule.recipients.join("\n");
      updateSchedule.mutate(
        { id: schedule.id, ...payload, ...(recipientsChanged ? { recipients } : {}) },
        callbacks
      );
    } else {
      createSchedule.mutate({ reportKey: form.reportKey, recipients, ...payload }, callbacks);
    }
  };

  const r = form.recurrence;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{schedule ? "Edit schedule" : "Schedule report"}</DialogTitle>
          <DialogDescription>
            Emails {reportName} on a schedule. Times are in your company&apos;s time zone ({timeZone}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!schedule && !reportKey && (
            <div className="space-y-1.5">
              <Label className="text-xs">Report</Label>
              <Select value={form.reportKey} onValueChange={(value) => setForm((f) => ({ ...f, reportKey: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a report" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULABLE_REPORTS.map((def) => (
                    <SelectItem key={def.key} value={def.key}>
                      {def.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Frequency</Label>
              <Select value={r.frequency} onValueChange={(value) => setRecurrence({ frequency: value as ScheduleFrequency })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQUENCY_LABELS) as ScheduleFrequency[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Send time</Label>
              <Select value={String(r.hourLocal)} onValueChange={(value) => setRecurrence({ hourLocal: Number(value) })}>
                <SelectTrigger>
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

          {r.frequency === "weekly" && (
            <div className="space-y-1.5">
              <Label className="text-xs">On</Label>
              <div className="flex flex-wrap gap-3">
                {WEEKDAY_SHORT.map((label, day) => (
                  <label key={label} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={r.weekdays.includes(day)}
                      onCheckedChange={(checked) => toggleWeekday(day, checked === true)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {r.frequency === "monthly" && (
            <div className="space-y-2">
              <Label className="text-xs">On</Label>
              <Select
                value={r.monthlyMode ?? "day_of_month"}
                onValueChange={(value) => setRecurrence({ monthlyMode: value as MonthlyMode })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day_of_month">A day of the month</SelectItem>
                  <SelectItem value="nth_weekday">A weekday of the month (e.g. last Friday)</SelectItem>
                </SelectContent>
              </Select>
              {r.monthlyMode === "nth_weekday" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    value={String(r.monthWeek ?? 1)}
                    onValueChange={(value) => setRecurrence({ monthWeek: Number(value) as MonthWeek })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_WEEKS.map((w) => (
                        <SelectItem key={w} value={String(w)}>
                          {WEEK_LABELS[w]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(r.monthWeekday ?? 1)}
                    onValueChange={(value) => setRecurrence({ monthWeekday: Number(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAY_LONG.map((label, day) => (
                        <SelectItem key={label} value={String(day)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Day</span>
                  <Select
                    value={String(r.monthDay ?? 1)}
                    onValueChange={(value) => setRecurrence({ monthDay: Number(value) })}
                  >
                    <SelectTrigger className="w-[90px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_OPTIONS.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(r.monthDay ?? 1) > 28 && (
                    <span className="text-xs text-muted-foreground">Shorter months send on their last day.</span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{r.frequency === "once" ? "Send on" : "Start date"}</Label>
              <Input
                type="date"
                value={r.startDate ?? ""}
                onChange={(e) => setRecurrence({ startDate: e.target.value || null })}
              />
            </div>
            {r.frequency !== "once" && (
              <div className="space-y-1.5">
                <Label className="text-xs">End date (optional)</Label>
                <Input
                  type="date"
                  value={r.endDate ?? ""}
                  min={r.startDate ?? undefined}
                  onChange={(e) => setRecurrence({ endDate: e.target.value || null })}
                />
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">{summary ?? problem}</p>

          <div className="space-y-1.5">
            <Label className="text-xs">Format</Label>
            <Select value={form.format} onValueChange={(value) => setForm((f) => ({ ...f, format: value as ScheduleFormat }))}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Recipients (comma or newline separated)</Label>
            <Textarea
              rows={2}
              placeholder="you@company.com, ops@company.com"
              value={form.recipientsText}
              onChange={(e) => setForm((f) => ({ ...f, recipientsText: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Subject (optional)</Label>
            <Input
              maxLength={200}
              placeholder={`${reportName} — <date>`}
              value={form.emailSubject}
              onChange={(e) => setForm((f) => ({ ...f, emailSubject: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Message (optional)</Label>
            <Textarea
              rows={3}
              maxLength={5000}
              placeholder="Shown above the attachment note in the email."
              value={form.emailMessage}
              onChange={(e) => setForm((f) => ({ ...f, emailMessage: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : schedule ? "Save changes" : "Add schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
