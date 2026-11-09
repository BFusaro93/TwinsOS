"use client";

import { useState } from "react";
import { CalendarClock, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useCurrentUserStore } from "@/stores";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import {
  useDeleteReportSchedule,
  useReportSchedules,
  useUpdateReportSchedule,
  type ReportSchedule,
} from "@/lib/hooks/use-report-schedules";
import { useCustomReports } from "@/lib/hooks/use-report-center";
import { DATE_WINDOW_LABELS, isDateWindow } from "@/lib/reports/schedule-date-window";
import { getReport } from "@/lib/reports/registry";
import { describeRecurrence, recurrenceFromRow } from "@/lib/reports/schedule-recurrence";
import { formatInZone, todayInZone } from "@/lib/time/zone";
import { ReportScheduleEditorDialog } from "./ReportScheduleEditorDialog";

const DATE_TIME: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * Report Center → Scheduled: every scheduled report delivery in the org, with
 * its rule, recipients, format, last run and next run (both on the ORG's
 * clock), and edit / pause-resume / delete for roles with
 * manage_report_center. Viewing needs only view_report_center (the hub's own
 * gate; the API re-checks it).
 */
export function ScheduledReportsList() {
  const { can } = usePermissions();
  const canManage = can("manage_report_center");
  const isAdmin = useCurrentUserStore().currentUser.role === "admin";
  const timeZone = useOrgTimeZone();
  const today = todayInZone(timeZone);
  const { data: schedules = [], isLoading, error } = useReportSchedules();
  const updateSchedule = useUpdateReportSchedule();
  const deleteSchedule = useDeleteReportSchedule();
  const { data: savedAnalyses = [] } = useCustomReports();
  const scheduleName = (s: ReportSchedule): string =>
    s.custom_report_id
      ? (savedAnalyses.find((a) => a.id === s.custom_report_id)?.name ?? "Saved analysis (deleted)")
      : (getReport(s.report_key ?? "")?.name ?? s.report_key ?? "");
  const [editing, setEditing] = useState<ReportSchedule | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ReportSchedule | null>(null);

  const setEnabled = (s: ReportSchedule, enabled: boolean) =>
    updateSchedule.mutate(
      { id: s.id, enabled },
      {
        onSuccess: () => toast.success(enabled ? "Schedule resumed." : "Schedule paused."),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
      }
    );

  // A schedule runs as its creator; once that person is deactivated it is
  // paused until an admin takes it over (becomes the owner) and resumes it.
  // With no recipients left (the creator's own address is removed when they
  // are deactivated) it is taken over but left paused, and the editor opens.
  const takeOver = (s: ReportSchedule) => {
    const resume = s.recipients.length > 0;
    updateSchedule.mutate(
      { id: s.id, takeOver: true, ...(resume ? { enabled: true } : {}) },
      {
        onSuccess: (updated) => {
          if (resume) {
            toast.success("You now own this schedule, and it has resumed.");
          } else {
            toast.success("You now own this schedule. Add recipients, then resume it.");
            setEditing(updated);
          }
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
      }
    );
  };

  const statusFor = (s: ReportSchedule): { label: string; tone: "default" | "secondary" | "outline" } => {
    if (s.enabled) return { label: "Active", tone: "default" };
    if (s.frequency === "once" && s.last_run_status === "success") return { label: "Sent", tone: "secondary" };
    return { label: "Paused", tone: "outline" };
  };

  const nextRunText = (s: ReportSchedule): string => {
    if (!s.enabled) return "—";
    if (!s.next_run_at) return s.end_date ? "Ended" : "—";
    if (new Date(s.next_run_at).getTime() <= Date.now()) return "Due now";
    return formatInZone(s.next_run_at, timeZone, DATE_TIME);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Reports emailed on a schedule. Times are in your company&apos;s time zone.
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Schedule
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          {error instanceof Error ? error.message : "Couldn't load schedules."}
        </p>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card py-16 text-center">
          <CalendarClock className="h-8 w-8 text-slate-300 dark:text-neutral-500" />
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-neutral-300">No scheduled reports</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Open a schedulable report and click Schedule, or add one here.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Report</th>
                <th className="px-3 py-2 font-medium">Schedule</th>
                <th className="px-3 py-2 font-medium">Recipients</th>
                <th className="px-3 py-2 font-medium">Format</th>
                <th className="px-3 py-2 font-medium">Last run</th>
                <th className="px-3 py-2 font-medium">Next run</th>
                <th className="px-3 py-2 font-medium">Status</th>
                {canManage && <th className="w-10 px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => {
                const status = statusFor(s);
                return (
                  <tr key={s.id} className="border-b last:border-0 align-top">
                    <td className="px-3 py-2 font-medium">
                      {scheduleName(s)}
                      {s.custom_report_id && (
                        <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">analysis</span>
                      )}
                      {s.creator_inactive && (
                        <div className="text-xs font-normal text-amber-700 dark:text-amber-400">
                          Created by {s.creator_name ?? "a user"} (deactivated)
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {describeRecurrence(recurrenceFromRow(s), today)}
                      {s.date_filter_column && isDateWindow(s.date_window) && (
                        <div className="text-xs text-muted-foreground">Data: {DATE_WINDOW_LABELS[s.date_window]}</div>
                      )}
                      {s.last_run_status === "error" && s.last_run_error && (
                        <div className="max-w-[240px] text-xs text-red-600 dark:text-red-400">{s.last_run_error}</div>
                      )}
                      {s.last_run_status === "paused" && s.last_run_error && (
                        <div className="max-w-[240px] text-xs text-amber-700 dark:text-amber-400">{s.last_run_error}</div>
                      )}
                    </td>
                    <td className="max-w-[220px] px-3 py-2">
                      <span className="line-clamp-2 break-all text-xs text-slate-700 dark:text-neutral-300" title={s.recipients.join(", ")}>
                        {s.recipients.join(", ")}
                      </span>
                    </td>
                    <td className="px-3 py-2">{s.format === "xlsx" ? "Excel" : "PDF"}</td>
                    <td className="px-3 py-2 text-xs">
                      {s.last_run_at ? (
                        <div className="flex flex-col gap-1">
                          <span>{formatInZone(s.last_run_at, timeZone, DATE_TIME)}</span>
                          {s.last_run_status && (
                            <Badge
                              variant={
                                s.last_run_status === "success"
                                  ? "secondary"
                                  : s.last_run_status === "paused"
                                    ? "outline"
                                    : "destructive"
                              }
                              className="w-fit text-[10px]"
                              title={s.last_run_error ?? undefined}
                            >
                              {s.last_run_status === "success" ? "Sent OK" : s.last_run_status === "paused" ? "Paused" : "Failed"}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{nextRunText(s)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={status.tone} className="text-[10px]">
                        {status.label}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="px-3 py-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Schedule actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(s)}>Edit</DropdownMenuItem>
                            {s.creator_inactive && !s.enabled ? (
                              isAdmin ? (
                                <DropdownMenuItem onClick={() => takeOver(s)}>Take over &amp; resume</DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem disabled>Resume (an admin must take it over)</DropdownMenuItem>
                              )
                            ) : (
                              <DropdownMenuItem onClick={() => setEnabled(s, !s.enabled)}>
                                {s.enabled ? "Pause" : "Resume"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-red-600 dark:text-red-400"
                              onClick={() => setPendingDelete(s)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ReportScheduleEditorDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          schedule={editing === "new" ? null : editing}
          reportKey={null}
        />
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? scheduleName(pendingDelete) : ""} will
              stop emailing to {pendingDelete?.recipients.join(", ")}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return;
                deleteSchedule.mutate(pendingDelete.id, {
                  onSuccess: () => toast.success("Schedule deleted."),
                  onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
                });
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
