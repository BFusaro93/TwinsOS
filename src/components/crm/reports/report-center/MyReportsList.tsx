"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, MoreHorizontal, Plus } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { DATASET_MAP } from "@/lib/reports/datasets";
import {
  useCreateCustomReport,
  useCustomReports,
  useDeleteCustomReport,
} from "@/lib/hooks/use-report-center";
import type { CustomReport } from "@/types/crm-reports";

export function MyReportsList() {
  const { data: reports = [], isLoading } = useCustomReports();
  const createReport = useCreateCustomReport();
  const deleteReport = useDeleteCustomReport();
  const [pendingDelete, setPendingDelete] = useState<CustomReport | null>(null);

  const handleDuplicate = (report: CustomReport) => {
    createReport.mutate({
      name: `${report.name} (Copy)`,
      description: report.description,
      config: report.config,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Saved custom analyses built from your CRM data.
        </p>
        <Button size="sm" asChild>
          <Link href="/crm/admin/reports/analysis/new">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Analysis
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-white py-16 text-center">
          <BarChart3 className="h-8 w-8 text-slate-300" />
          <div>
            <p className="text-sm font-medium text-slate-700">
              No custom reports yet
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              Build your first analysis — pick a dataset, choose columns, group
              and total however you like.
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/crm/admin/reports/analysis/new">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Analysis
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 text-left">Name</th>
                  <th className="px-4 py-2.5 text-left">Description</th>
                  <th className="px-4 py-2.5 text-left">Dataset</th>
                  <th className="px-4 py-2.5 text-left">Last Updated</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr
                    key={report.id}
                    className="border-b last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/crm/admin/reports/analysis/${report.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {report.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {report.description || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {DATASET_MAP[report.config.dataset]?.label ??
                        report.config.dataset}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {formatDate(report.updatedAt)}
                    </td>
                    <td className="px-2 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Report actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/crm/admin/reports/analysis/${report.id}`}>
                              Open
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDuplicate(report)}
                          >
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => setPendingDelete(report)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{pendingDelete?.name}&quot; will be removed from My Reports.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (pendingDelete) deleteReport.mutate(pendingDelete.id);
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
