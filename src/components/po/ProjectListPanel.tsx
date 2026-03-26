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
        <p className="px-4 py-8 text-center text-sm text-slate-400">No projects found</p>
      )}
      {projects.map((project) => {
        const isSelected = project.id === selectedId;
        return (
          <button
            key={project.id}
            onClick={() => onSelect(project.id)}
            className={cn(
              "flex w-full flex-col gap-1 border-b px-4 py-3 text-left transition-colors hover:bg-slate-50",
              isSelected && "border-l-2 border-l-brand-500 bg-brand-50 hover:bg-brand-50"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">
                {project.name}
              </span>
              <StatusBadge
                variant={project.status === "on_hold" ? "on_hold_project" : project.status}
                label={PROJECT_STATUS_LABELS[project.status]}
                className="shrink-0 whitespace-nowrap"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-slate-500">{project.customerName}</span>
              <span className="shrink-0 text-xs font-medium text-slate-600">
                {formatCurrency(project.totalCost)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
