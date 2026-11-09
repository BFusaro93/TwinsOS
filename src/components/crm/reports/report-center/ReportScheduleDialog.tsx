"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useReportSchedules } from "@/lib/hooks/use-report-schedules";
import { ReportScheduleEditorDialog } from "./ReportScheduleEditorDialog";

/** "Schedule" button on a schedulable report's page — opens the schedule
 *  editor for a new delivery of this report, and links to the Report
 *  Center's Scheduled tab when the report already has schedules. Hidden from
 *  roles without manage_report_center (the API enforces it regardless). */
export function ReportScheduleDialog({
  reportKey,
  customReportId,
}: {
  reportKey?: string;
  /** Schedule a saved custom analysis instead of a prebuilt report. */
  customReportId?: string;
}) {
  const [open, setOpen] = useState(false);
  const { can, isLoading: permissionsLoading } = usePermissions();
  const canManage = !permissionsLoading && can("manage_report_center");
  const { data: allSchedules } = useReportSchedules({ enabled: canManage });
  const existing = (allSchedules ?? []).filter((s) => (customReportId ? s.custom_report_id === customReportId : s.report_key === reportKey)).length;

  if (!canManage) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
        Schedule
      </Button>
      {existing > 0 && (
        <Link
          href="/crm/admin/reports?tab=schedules"
          className="self-center text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          {existing} scheduled
        </Link>
      )}
      {open && (
        <ReportScheduleEditorDialog
          open={open}
          onOpenChange={setOpen}
          schedule={null}
          reportKey={reportKey ?? null}
          customReportId={customReportId ?? null}
        />
      )}
    </>
  );
}
