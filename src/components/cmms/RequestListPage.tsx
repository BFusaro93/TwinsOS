"use client";

import { useState } from "react";
import { Plus, ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { FilterBar } from "@/components/shared/FilterBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { RequestListPanel } from "./RequestListPanel";
import { RequestDetailPanel } from "./RequestDetailPanel";
import { NewRequestDialog } from "./NewRequestDialog";
import { Button } from "@/components/ui/button";
import { useRequests } from "@/lib/hooks/use-requests";
import { useCMMSStore } from "@/stores";
import { REQUEST_STATUS_LABELS, WO_PRIORITY_LABELS } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import type { MaintenanceRequestStatus, WorkOrderPriority } from "@/types";
import { matchesFilter } from "@/lib/utils";

const STATUS_OPTIONS = (
  Object.keys(REQUEST_STATUS_LABELS) as MaintenanceRequestStatus[]
).map((k) => ({ value: k, label: REQUEST_STATUS_LABELS[k] }));

const PRIORITY_OPTIONS = (Object.keys(WO_PRIORITY_LABELS) as WorkOrderPriority[]).map(
  (k) => ({ value: k, label: WO_PRIORITY_LABELS[k] })
);

export function RequestListPage() {
  const { data: requests, isLoading } = useRequests();
  const { selectedRequestId, setSelectedRequestId } = useCMMSStore();
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = (requests ?? []).filter((req) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      req.requestNumber.toLowerCase().includes(q) ||
      req.title.toLowerCase().includes(q) ||
      req.requestedByName.toLowerCase().includes(q) ||
      (req.assetName ?? "").toLowerCase().includes(q);
    const matchStatus = matchesFilter(req.status, filterValues.status);
    const matchPriority = matchesFilter(req.priority, filterValues.priority);
    return matchSearch && matchStatus && matchPriority;
  });

  const selectedRequest = filtered.find((r) => r.id === selectedRequestId) ?? null;

  const listPanel = isLoading ? (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
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
            { key: "priority", placeholder: "All Priorities", options: PRIORITY_OPTIONS, multi: true },
          ]}
          filterValues={filterValues}
          onFilterChange={(key, value) =>
            setFilterValues((prev) => ({ ...prev, [key]: value }))
          }
          searchPlaceholder="Search requests..."
        />
      </div>
      <RequestListPanel
        requests={filtered}
        selectedId={selectedRequestId}
        onSelect={setSelectedRequestId}
      />
    </>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Maintenance Requests"
        action={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Request
          </Button>
        }
      />

      <MasterDetailLayout
        listPanel={listPanel}
        detailPanel={
          selectedRequest ? <RequestDetailPanel key={selectedRequestId} request={selectedRequest} /> : null
        }
        emptyState={
          <EmptyState
            icon={ClipboardList}
            title="Select a request"
            description="Choose a maintenance request to review it, convert it to a work order, or reject it."
          />
        }
        hasSelection={!!selectedRequest}
      />

      <NewRequestDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
