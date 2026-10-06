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
  enrolled: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  wait_advanced: "bg-muted text-slate-600 dark:text-neutral-400 border-border",
  email_sent: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
  email_skipped: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800",
  sms_sent: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
  sms_skipped: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800",
  ticket_created: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  field_updated: "bg-muted text-slate-600 dark:text-neutral-400 border-border",
  tags_updated: "bg-muted text-slate-600 dark:text-neutral-400 border-border",
  note_skipped: "bg-muted text-muted-foreground border-border",
  branch_true: "bg-muted text-slate-600 dark:text-neutral-400 border-border",
  branch_false: "bg-muted text-slate-600 dark:text-neutral-400 border-border",
  awaiting_approval: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  approval_approved: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
  approval_rejected: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  alert_sent: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  stopped_by_condition: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  completed: "bg-muted text-slate-600 dark:text-neutral-400 border-border",
  unsupported_event_type: "bg-muted text-muted-foreground border-border",
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

      <div className="flex-1 overflow-auto rounded-lg border bg-card">
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
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(e.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-slate-700 dark:text-neutral-300">
                    {e.sequenceName ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-blue-600 dark:text-blue-400">
                    {e.clientName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ACTION_COLORS[e.action] ?? "bg-muted text-slate-600 dark:text-neutral-400"}>
                      {ACTION_LABELS[e.action] ?? e.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm text-muted-foreground">
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
