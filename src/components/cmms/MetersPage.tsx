"use client";

import { useState } from "react";
import { Gauge, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { FilterBar } from "@/components/shared/FilterBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { MetersListPanel } from "@/components/cmms/MetersListPanel";
import { MeterDetailPanel } from "@/components/cmms/MeterDetailPanel";
import { NewMeterDialog } from "@/components/cmms/NewMeterDialog";
import { useMeters } from "@/lib/hooks/use-meters";
import { useCMMSStore } from "@/stores/cmms-store";

const SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "samsara", label: "Samsara" },
];

export function MetersPage() {
  const [newMeterOpen, setNewMeterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({});
  const { data: meters, isLoading } = useMeters();
  const { selectedMeterId, setSelectedMeterId } = useCMMSStore();

  const filtered = (meters ?? []).filter((m) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.assetName.toLowerCase().includes(q);
    const sourceFilter = filterValues.source;
    const matchSource =
      !sourceFilter ||
      (Array.isArray(sourceFilter) ? sourceFilter.length === 0 || sourceFilter.includes(m.source) : m.source === sourceFilter);
    return matchSearch && matchSource;
  });

  const selectedMeter = filtered.find((m) => m.id === selectedMeterId) ?? null;

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
            {
              key: "source",
              placeholder: "All Sources",
              options: SOURCE_OPTIONS,
              multi: true,
            },
          ]}
          filterValues={filterValues}
          onFilterChange={(key, value) =>
            setFilterValues((prev) => ({ ...prev, [key]: value }))
          }
          searchPlaceholder="Search meters..."
        />
      </div>
      <MetersListPanel
        meters={filtered}
        selectedId={selectedMeterId}
        onSelect={(id) => setSelectedMeterId(selectedMeterId === id ? null : id)}
      />
    </>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Meters"
        description="Equipment hour and mileage readings"
        action={
          <Button size="sm" onClick={() => setNewMeterOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Meter
          </Button>
        }
      />

      <MasterDetailLayout
        listPanel={listPanel}
        detailPanel={selectedMeter ? <MeterDetailPanel meter={selectedMeter} /> : null}
        emptyState={
          <EmptyState
            icon={Gauge}
            title="Select a meter"
            description="Choose a meter to view its current reading, history, and linked asset."
          />
        }
        hasSelection={!!selectedMeter}
      />

      <NewMeterDialog open={newMeterOpen} onOpenChange={setNewMeterOpen} />
    </div>
  );
}
