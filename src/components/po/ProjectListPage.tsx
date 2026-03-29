"use client";

import { useState } from "react";
import { useStickyState } from "@/lib/hooks/use-sticky-state";
import { Plus, FolderKanban, Maximize2, Minimize2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { FilterBar } from "@/components/shared/FilterBar";
import { AdvancedSearchDialog } from "@/components/shared/AdvancedSearchDialog";
import { ColumnChooser, type ColumnDef } from "@/components/shared/ColumnChooser";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { ProjectListPanel } from "./ProjectListPanel";
import { ProjectDetailPanel } from "./ProjectDetailPanel";
import { NewProjectDialog } from "./NewProjectDialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/lib/hooks/use-projects";
import { usePOStore } from "@/stores";
import { useSort } from "@/lib/hooks/use-sort";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate, matchesFilter } from "@/lib/utils";
import type { ProjectStatus } from "@/types";

const STATUS_OPTIONS = (Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((k) => ({
  value: k,
  label: PROJECT_STATUS_LABELS[k],
}));

const PROJECT_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", locked: true },
  { key: "customerName", label: "Customer", locked: true },
  { key: "status", label: "Status" },
  { key: "startDate", label: "Start Date" },
  { key: "endDate", label: "End Date" },
  { key: "totalCost", label: "Total Cost" },
];

export function ProjectListPage() {
  const { data: projects, isLoading } = useProjects();
  const { selectedProjectId, setSelectedProjectId } = usePOStore();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useStickyState<Record<string, string | string[]>>("project-filters", {});
  const [viewMode, setViewMode] = useState<"list" | "table">("list");
  const [sheetProjectId, setSheetProjectId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(PROJECT_COLUMNS.map((c) => c.key));

  const col = (key: string) => visibleKeys.includes(key);
  const all = projects ?? [];
  const sheetProject = sheetProjectId ? (all.find((p) => p.id === sheetProjectId) ?? null) : null;

  const advancedFilters = [
    { key: "status", placeholder: "All Statuses", options: STATUS_OPTIONS, multi: true as const },
  ];

  const activeFilterCount = advancedFilters.filter((f) => {
    const v = filterValues[f.key];
    return Array.isArray(v) ? v.length > 0 : !!v && v !== "all";
  }).length;

  function handleFilterChange(key: string, value: string | string[]) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = all.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.customerName.toLowerCase().includes(q);
    const matchStatus = matchesFilter(p.status, filterValues.status);
    return matchSearch && matchStatus;
  });

  const { sortKey, sortDir, toggle, sorted } = useSort(filtered, "createdAt", "desc");

  const selectedProject =
    filtered.find((p) => p.id === selectedProjectId) ?? null;

  // ── Shared filter controls ─────────────────────────────────────────────────
  const searchAndFilters = (
    <>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        filters={[]}
        filterValues={filterValues}
        onFilterChange={handleFilterChange}
        searchPlaceholder="Search projects..."
      />
      <AdvancedSearchDialog
        filters={advancedFilters}
        filterValues={filterValues}
        onFilterChange={(key, value) => handleFilterChange(key, value)}
        activeCount={activeFilterCount}
      />
    </>
  );

  // ── List panel ─────────────────────────────────────────────────────────────
  const listPanel = isLoading ? (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-md" />
      ))}
    </div>
  ) : (
    <>
      <div className="border-b p-3">
        <div className="flex items-center gap-2">{searchAndFilters}</div>
      </div>
      <ProjectListPanel
        projects={filtered}
        selectedId={selectedProjectId}
        onSelect={setSelectedProjectId}
      />
    </>
  );

  // ── Table view ─────────────────────────────────────────────────────────────
  const tableView = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">{searchAndFilters}</div>
        <ColumnChooser
          columns={PROJECT_COLUMNS}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
        />
      </div>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <SortableTableHead label="Name" sortKey="name" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTableHead label="Customer" sortKey="customerName" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              {col("status") && <SortableTableHead label="Status" sortKey="status" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("startDate") && <SortableTableHead label="Start Date" sortKey="startDate" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("endDate") && <SortableTableHead label="End Date" sortKey="endDate" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("totalCost") && <SortableTableHead label="Total Cost" sortKey="totalCost" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} className="text-right" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: visibleKeys.length }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleKeys.length} className="py-12 text-center">
                  <p className="text-sm text-slate-400">No projects found</p>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && sorted.map((project) => (
              <TableRow
                key={project.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setSheetProjectId(project.id)}
              >
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell className="text-slate-600">{project.customerName}</TableCell>
                {col("status") && (
                  <TableCell>
                    <StatusBadge
                      variant={project.status === "on_hold" ? "on_hold_project" : project.status}
                      label={PROJECT_STATUS_LABELS[project.status]}
                    />
                  </TableCell>
                )}
                {col("startDate") && (
                  <TableCell className="text-slate-500">{formatDate(project.startDate)}</TableCell>
                )}
                {col("endDate") && (
                  <TableCell className="text-slate-500">{project.endDate ? formatDate(project.endDate) : "TBD"}</TableCell>
                )}
                {col("totalCost") && (
                  <TableCell className="text-right font-medium">
                    {formatCurrency(project.totalCost)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Projects"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setViewMode(viewMode === "list" ? "table" : "list")}
            >
              {viewMode === "list" ? (
                <><Maximize2 className="h-3.5 w-3.5" />Table view</>
              ) : (
                <><Minimize2 className="h-3.5 w-3.5" />List view</>
              )}
            </Button>
            <Button size="sm" onClick={() => setNewProjectOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Project
            </Button>
          </div>
        }
      />

      {viewMode === "list" ? (
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
          onBack={() => setSelectedProjectId(null)}
        />
      ) : (
        tableView
      )}

      {/* Table-mode detail sheet */}
      <Sheet open={!!sheetProject} onOpenChange={(o) => { if (!o) setSheetProjectId(null); }}>
        <SheetContent
          className="flex w-full flex-col overflow-hidden p-0 md:w-[580px] md:max-w-[580px]"
        >
          {sheetProject && <ProjectDetailPanel project={sheetProject} />}
        </SheetContent>
      </Sheet>

      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </div>
  );
}
