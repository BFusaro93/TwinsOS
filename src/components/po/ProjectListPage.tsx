"use client";

import { useState } from "react";
import { Plus, FolderKanban } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { FilterBar } from "@/components/shared/FilterBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProjectListPanel } from "./ProjectListPanel";
import { ProjectDetailPanel } from "./ProjectDetailPanel";
import { NewProjectDialog } from "./NewProjectDialog";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/lib/hooks/use-projects";
import { usePOStore } from "@/stores";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectStatus } from "@/types";
import { matchesFilter } from "@/lib/utils";

const STATUS_OPTIONS = (Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((k) => ({
  value: k,
  label: PROJECT_STATUS_LABELS[k],
}));

export function ProjectListPage() {
  const { data: projects, isLoading } = useProjects();
  const { selectedProjectId, setSelectedProjectId } = usePOStore();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({});

  const filtered = (projects ?? []).filter((p) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.customerName.toLowerCase().includes(q);
    const statusFilter = filterValues.status;
    const matchStatus = matchesFilter(p.status, statusFilter);
    return matchSearch && matchStatus;
  });

  const selectedProject =
    filtered.find((p) => p.id === selectedProjectId) ?? null;

  const listPanel = isLoading ? (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-md" />
      ))}
    </div>
  ) : (
    <>
      <div className="border-b p-3">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          filters={[
            { key: "status", placeholder: "All Statuses", options: STATUS_OPTIONS, multi: true },
          ]}
          filterValues={filterValues}
          onFilterChange={(key, value) =>
            setFilterValues((prev) => ({ ...prev, [key]: value }))
          }
          searchPlaceholder="Search projects..."
        />
      </div>
      <ProjectListPanel
        projects={filtered}
        selectedId={selectedProjectId}
        onSelect={setSelectedProjectId}
      />
    </>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Projects"
        action={
          <Button size="sm" onClick={() => setNewProjectOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Project
          </Button>
        }
      />

      <MasterDetailLayout
        listPanel={listPanel}
        detailPanel={
          selectedProject ? <ProjectDetailPanel project={selectedProject} /> : null
        }
        emptyState={
          <EmptyState
            icon={FolderKanban}
            title="Select a project"
            description="Choose a project to view its details and materials."
          />
        }
        hasSelection={!!selectedProject}
      />
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </div>
  );
}
