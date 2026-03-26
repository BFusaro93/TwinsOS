"use client";

import { useState } from "react";
import { Plus, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { FilterBar } from "@/components/shared/FilterBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { PMScheduleListPanel } from "./PMScheduleListPanel";
import { PMScheduleDetailPanel } from "./PMScheduleDetailPanel";
import { NewPMScheduleDialog } from "./NewPMScheduleDialog";
import { Button } from "@/components/ui/button";
import { usePMSchedules } from "@/lib/hooks/use-pm-schedules";
import { useCMMSStore } from "@/stores";
import { PM_FREQUENCY_LABELS } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { matchesFilter, matchesIsActiveFilter } from "@/lib/utils";

const FREQUENCY_OPTIONS = Object.entries(PM_FREQUENCY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export function PMScheduleListPage() {
  const { data: schedules, isLoading } = usePMSchedules();
  const { selectedPMScheduleId, setSelectedPMScheduleId } = useCMMSStore();
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = (schedules ?? []).filter((s) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      s.title.toLowerCase().includes(q) ||
      s.assetName.toLowerCase().includes(q);
    const matchStatus = matchesIsActiveFilter(s.isActive, filterValues.status);
    const matchFrequency = matchesFilter(s.frequency, filterValues.frequency);
    return matchSearch && matchStatus && matchFrequency;
  });

  const selectedSchedule =
    filtered.find((s) => s.id === selectedPMScheduleId) ?? null;

  const listPanel = isLoading ? (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-md" />
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
            {
              key: "frequency",
              placeholder: "All Frequencies",
              options: FREQUENCY_OPTIONS,
              multi: true,
            },
          ]}
          filterValues={filterValues}
          onFilterChange={(key, value) =>
            setFilterValues((prev) => ({ ...prev, [key]: value }))
          }
          searchPlaceholder="Search PM schedules..."
        />
      </div>
      <PMScheduleListPanel
        schedules={filtered}
        selectedId={selectedPMScheduleId}
        onSelect={setSelectedPMScheduleId}
      />
    </>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="PM Schedules"
        action={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Schedule
          </Button>
        }
      />

      <MasterDetailLayout
        listPanel={listPanel}
        detailPanel={
          selectedSchedule ? (
            <PMScheduleDetailPanel schedule={selectedSchedule} />
          ) : null
        }
        emptyState={
          <EmptyState
            icon={CalendarClock}
            title="Select a PM schedule"
            description="Choose a preventive maintenance schedule to view its frequency, next due date, and instructions."
          />
        }
        hasSelection={!!selectedSchedule}
      />

      <NewPMScheduleDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
