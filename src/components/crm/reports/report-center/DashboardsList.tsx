"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutDashboard, MoreHorizontal, Plus } from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { DASHBOARD_TEMPLATES } from "@/lib/reports/dashboard-templates";
import {
  useCreateDashboard,
  useDashboards,
  useDeleteDashboard,
} from "@/lib/hooks/use-report-center";
import type { Dashboard } from "@/types/crm-reports";

function NewDashboardMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Dashboard
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/crm/admin/reports/dashboards/new">Blank Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {DASHBOARD_TEMPLATES.map((template) => (
          <DropdownMenuItem key={template.key} asChild>
            <Link href={`/crm/admin/reports/dashboards/new?template=${template.key}`}>
              <div className="flex flex-col">
                <span>{template.name}</span>
                <span className="text-xs text-muted-foreground">
                  {template.description}
                </span>
              </div>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DashboardsList() {
  const { data: dashboards = [], isLoading } = useDashboards();
  const createDashboard = useCreateDashboard();
  const deleteDashboard = useDeleteDashboard();
  const [pendingDelete, setPendingDelete] = useState<Dashboard | null>(null);

  const handleDuplicate = (dashboard: Dashboard) => {
    createDashboard.mutate({
      name: `${dashboard.name} (Copy)`,
      description: dashboard.description,
      config: dashboard.config,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Multi-tab dashboards built from your saved analyses.
        </p>
        <NewDashboardMenu />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : dashboards.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-white py-16 text-center">
          <LayoutDashboard className="h-8 w-8 text-slate-300" />
          <div>
            <p className="text-sm font-medium text-slate-700">
              No dashboards yet
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              Combine your saved analyses into a multi-tab dashboard.
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/crm/admin/reports/dashboards/new">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Dashboard
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
                  <th className="px-4 py-2.5 text-left">Tabs</th>
                  <th className="px-4 py-2.5 text-left">Last Updated</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {dashboards.map((dashboard) => (
                  <tr
                    key={dashboard.id}
                    className="border-b last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/crm/admin/reports/dashboards/${dashboard.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {dashboard.name}
                      </Link>
                      {dashboard.isSystemSeeded && (
                        <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                          Built-in
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {dashboard.description || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {dashboard.config.tabs.length}{" "}
                      {dashboard.config.tabs.length === 1 ? "tab" : "tabs"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {formatDate(dashboard.updatedAt)}
                    </td>
                    <td className="px-2 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Dashboard actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/crm/admin/reports/dashboards/${dashboard.id}`}>
                              Open
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/crm/admin/reports/dashboards/${dashboard.id}/edit`}>
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDuplicate(dashboard)}
                          >
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => setPendingDelete(dashboard)}
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
            <AlertDialogTitle>Delete this dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{pendingDelete?.name}&quot; will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (pendingDelete) deleteDashboard.mutate(pendingDelete.id);
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
