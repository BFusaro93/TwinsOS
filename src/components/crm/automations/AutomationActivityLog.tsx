"use client";

import { History } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { useSequenceExecutionLog } from "@/lib/hooks/use-sequence-execution-log";
import { usePermissions } from "@/lib/hooks/use-permissions";

const ACTION_LABELS: Record<string, string> = {
  enrolled: "Enrolled",
  wait_advanced: "Wait advanced",
  email_sent: "Email sent",
  email_skipped: "Email skipped",
  sms_sent: "Text sent",
  sms_skipped: "Text skipped",
  ticket_created: "Ticket created",
  field_updated: "Field updated",
  tags_updated: "Tags updated",
  note_skipped: "Note",
  branch_true: "If Branch — matched",
  branch_false: "If Branch — skipped",
  awaiting_approval: "Awaiting approval",
  approval_approved: "Approved",
  approval_rejected: "Rejected",
  alert_sent: "Alert sent",
  stopped_by_condition: "Stopped (condition)",
  completed: "Completed",
  unsupported_event_type: "Unsupported step",
};

const ACTION_COLORS: Record<string, string> = {
  enrolled: "bg-blue-50 text-blue-700 border-blue-200",
  wait_advanced: "bg-slate-100 text-slate-600 border-slate-200",
  email_sent: "bg-green-50 text-green-700 border-green-200",
  email_skipped: "bg-orange-50 text-orange-700 border-orange-200",
  sms_sent: "bg-green-50 text-green-700 border-green-200",
  sms_skipped: "bg-orange-50 text-orange-700 border-orange-200",
  ticket_created: "bg-blue-50 text-blue-700 border-blue-200",
  field_updated: "bg-slate-100 text-slate-600 border-slate-200",
  tags_updated: "bg-slate-100 text-slate-600 border-slate-200",
  note_skipped: "bg-slate-100 text-slate-500 border-slate-200",
  branch_true: "bg-slate-100 text-slate-600 border-slate-200",
  branch_false: "bg-slate-100 text-slate-600 border-slate-200",
  awaiting_approval: "bg-amber-50 text-amber-700 border-amber-200",
  approval_approved: "bg-green-50 text-green-700 border-green-200",
  approval_rejected: "bg-red-50 text-red-700 border-red-200",
  alert_sent: "bg-purple-50 text-purple-700 border-purple-200",
  stopped_by_condition: "bg-red-50 text-red-700 border-red-200",
  completed: "bg-slate-100 text-slate-600 border-slate-200",
  unsupported_event_type: "bg-slate-100 text-slate-500 border-slate-200",
};

export function AutomationActivityLog() {
  const { data: entries, isLoading } = useSequenceExecutionLog();
  const { can, isLoading: permissionsLoading } = usePermissions();

  if (!permissionsLoading && !can("automation_view")) {
    return (
      <EmptyState
        icon={History}
        title="No access"
        description="You don't have permission to view Automations."
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Automation Activity"
        description="Every enrollment, send, approval decision, and stop/complete event across all sequences."
      />

      <div className="flex-1 overflow-auto rounded-lg border bg-white">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (entries ?? []).length === 0 ? (
          <EmptyState
            icon={History}
            title="No automation activity yet"
            description="Once a sequence enrolls a client or sends a step, it'll show up here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Sequence</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(entries ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-xs text-slate-500">
                    {formatDateTime(e.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {e.sequenceName ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-blue-600">
                    {e.clientName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ACTION_COLORS[e.action] ?? "bg-slate-100 text-slate-600"}>
                      {ACTION_LABELS[e.action] ?? e.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm text-slate-500">
                    {e.detail ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
