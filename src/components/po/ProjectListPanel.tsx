"use client";

import { cn, formatCurrency } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import type { Project } from "@/types";

interface ProjectListPanelProps {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ProjectListPanel({ projects, selectedId, onSelect }: ProjectListPanelProps) {
  return (
    <div className="flex flex-col overflow-y-auto">
      {projects.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-neutral-500">No projects found</p>
      )}
      {projects.map((project) => {
        const isSelected = project.id === selectedId;
        return (
          <button
            key={project.id}
            onClick={() => onSelect(project.id)}
            className={cn(
              "flex w-full flex-col gap-1 border-b px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-muted/40",
              isSelected && "border-l-2 border-l-brand-500 bg-brand-50 dark:bg-brand-900/30 hover:bg-brand-50 dark:hover:bg-brand-900/30"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-slate-900 dark:text-neutral-100">
                {project.name}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {project.isArchived && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Archived</span>
                )}
                <StatusBadge
                  variant={project.status === "on_hold" ? "on_hold_project" : project.status}
                  label={PROJECT_STATUS_LABELS[project.status]}
                  className="whitespace-nowrap"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-muted-foreground">{project.customerName}</span>
              <span className="shrink-0 text-xs font-medium text-slate-600 dark:text-neutral-400">
                {formatCurrency(project.contractPrice)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
