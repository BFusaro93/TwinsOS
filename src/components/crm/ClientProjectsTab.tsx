"use client";

import { useState } from "react";
import { useClientProjects } from "@/lib/hooks/use-client-cmms";
import { ProjectDetailSheet } from "@/components/po/ProjectDetailSheet";
import { NewProjectDialog } from "@/components/po/NewProjectDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FolderKanban, Plus } from "lucide-react";
import type { Project } from "@/types";

interface Props {
  clientId: string;
  clientName: string;
}

export function ClientProjectsTab({ clientId, clientName }: Props) {
  const { data: projects, isLoading } = useClientProjects(clientId, clientName);
  const [openProject, setOpenProject] = useState<Project | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const newProjectButton = (
    <Button size="sm" onClick={() => setNewOpen(true)}>
      <Plus className="mr-1.5 h-4 w-4" /> New Project
    </Button>
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!projects?.length) {
    return (
      <>
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-white py-12 text-center">
          <FolderKanban className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No projects yet</p>
          <p className="text-xs text-slate-400">
            Projects matching this client&apos;s name will appear here.
          </p>
          <div className="mt-2">{newProjectButton}</div>
        </div>
        <NewProjectDialog open={newOpen} onOpenChange={setNewOpen} defaultClientId={clientId} />
      </>
    );
  }

  return (
    <>
      <div className="flex justify-end">{newProjectButton}</div>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2">Project</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Start</th>
              <th className="px-4 py-2">End</th>
              <th className="px-4 py-2 text-right">Contract</th>
              <th className="px-4 py-2 text-right">Cost to Date</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr
                key={p.id}
                className="cursor-pointer border-b last:border-b-0 hover:bg-slate-50"
                onClick={() => setOpenProject(p)}
              >
                <td className="px-4 py-2.5 font-medium text-slate-800">{p.name}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge
                    variant={p.status === "on_hold" ? "on_hold_project" : p.status}
                    label={PROJECT_STATUS_LABELS[p.status]}
                  />
                </td>
                <td className="px-4 py-2.5 text-slate-500">{formatDate(p.startDate)}</td>
                <td className="px-4 py-2.5 text-slate-500">{formatDate(p.endDate)}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">
                  {p.contractPrice ? formatCurrency(p.contractPrice) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-700">{formatCurrency(p.totalCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t px-4 py-2 text-xs text-slate-400">
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </div>
      </div>

      <ProjectDetailSheet
        project={openProject}
        open={!!openProject}
        onOpenChange={(open) => { if (!open) setOpenProject(null); }}
      />
      <NewProjectDialog open={newOpen} onOpenChange={setNewOpen} defaultClientId={clientId} />
    </>
  );
}
