"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useWaitingListJobs,
  useCRMCrews,
  useCreateVisit,
} from "@/lib/hooks/use-crm-jobs";
import { JobDetailSheet } from "@/components/crm/jobs/JobDetailSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { ColumnChooser } from "@/components/shared/ColumnChooser";
import type { ColumnDef } from "@/components/shared/ColumnChooser";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NewJobDialog } from "@/components/crm/jobs/NewJobDialog";
import { formatCurrency, cn } from "@/lib/utils";
import { Plus, ListOrdered, ChevronDown, RotateCcw, Search, Send, X, Mail } from "lucide-react";
import { BulkEmailClientsDialog } from "@/components/crm/BulkEmailClientsDialog";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { usePersistedColumns } from "@/lib/hooks/use-ui-prefs";
// Property-scoped defs, NOT the client-level ones: the property values these
// columns render come from crm_property_custom_field_values, which keys off
// crm_rate_matrix_field_defs. Reading the client-level def table here is what
// made every custom takeoff column permanently blank.
import { usePropertyCustomFieldDefs } from "@/lib/hooks/use-client-custom-fields";
import type { PropertyCustomFieldDef } from "@/lib/hooks/use-client-custom-fields";
import { useOrgTags } from "@/lib/hooks/use-clients";
import { Flame, Tag, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FilterOptionRow } from "@/components/shared/FilterOptionRow";
import type { CRMJob, CRMJobService } from "@/types/crm-jobs";

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateRange(start: string | null, end: string | null): string {
  const fmt = (s: string) =>
    new Date(s + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  if (end) return `Until ${fmt(end)}`;
  return "Any time";
}

// ── column + filter config ──────────────────────────────────────────────────

const WAITING_LIST_COLUMNS: ColumnDef[] = [
  { key: "client", label: "Client", locked: true },
  { key: "service", label: "Service" },
  { key: "dateRange", label: "Date Range" },
  { key: "city", label: "City" },
  { key: "zip", label: "Zip" },
  { key: "crew", label: "Crew" },
  { key: "rate", label: "Rate" },
];

/** Extra columns not shown by default — the same Client/Property fields the
 *  Dispatch Board's column picker offers, so the two boards stay in sync. */
const EXTRA_COLUMNS: ColumnDef[] = [
  { key: "priority",      label: "Priority" },
  { key: "sales_rep",     label: "Sales Rep" },
  { key: "notes_to_crew", label: "Notes to Crew" },
  { key: "gate_code",     label: "Gate/Lock Code" },
  { key: "turf_sqft",     label: "Turf Sq. Ft." },
  { key: "mulch_sqft",    label: "Mulch Bed Sq. Ft." },
  { key: "gross_sqft",    label: "Gross Sq. Ft." },
  { key: "lin_perimeter", label: "Linear Ft. of Perimeter" },
  { key: "lin_edging",    label: "Linear Ft. of Edging" },
  { key: "yards_mulch",   label: "Yards of Mulch" },
  { key: "parking_sqft",  label: "Parking Lot Sq. Ft." },
];

function customColKey(fieldDefId: string) { return `custom:${fieldDefId}`; }

function formatSqft(n: number | null | undefined): string {
  return n != null ? n.toLocaleString() : "—";
}

function extraColCellText(key: string, job: CRMJob): string {
  switch (key) {
    case "sales_rep":     return job.salesRepName ?? "—";
    case "notes_to_crew": return job.propertyNotesToCrew ?? job.notesToCrew ?? "—";
    case "gate_code":     return job.propertyGateCode ?? "—";
    case "turf_sqft":     return formatSqft(job.propertyTurfSqft);
    case "mulch_sqft":    return formatSqft(job.propertyMulchBedSqft);
    case "gross_sqft":    return formatSqft(job.propertyGrossSqft);
    case "lin_perimeter": return formatSqft(job.propertyLinearFtPerimeter);
    case "lin_edging":    return formatSqft(job.propertyLinearFtEdging);
    case "yards_mulch":   return formatSqft(job.propertyYardsOfMulch);
    case "parking_sqft":  return formatSqft(job.propertyParkingLotSqft);
    default:              return "—";
  }
}

type ColFilterKey = "client" | "city" | "zip" | "crew";

const COL_FILTERS: { key: ColFilterKey; label: string }[] = [
  { key: "client", label: "Client" },
  { key: "city", label: "City" },
  { key: "zip", label: "Zip" },
  { key: "crew", label: "Crew" },
];

const PRIORITY_FILTER_JOB_OPTIONS = [
  { value: "job_high",   label: "High priority" },
  { value: "job_normal", label: "Normal priority" },
];
const PRIORITY_FILTER_CLIENT_OPTIONS = [
  { value: "client_high",   label: "Client: High" },
  { value: "client_normal", label: "Client: Normal" },
  { value: "client_low",    label: "Client: Low" },
];

// ── dispatch dialog ──────────────────────────────────────────────────────────

interface DispatchItem {
  job: CRMJob;
  /** When set, this item is one visit within a package/multi-service job rather than the whole job. */
  service: CRMJobService | null;
}

interface DispatchJobsDialogProps {
  items: DispatchItem[];
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

function DispatchJobsDialog({ items, onOpenChange, onDone }: DispatchJobsDialogProps) {
  const { data: crews } = useCRMCrews();
  const createVisit = useCreateVisit();
  const singleService = items.length === 1 ? items[0].service : null;
  const [date, setDate] = useState(() => singleService?.startDate || toLocalDateString(new Date()));
  // Seeded from the jobs' own crew when they all share one. Defaulting to
  // "Unassigned" wrote crew_id: null onto every visit dispatched from here, so
  // an already-crewed job landed on the board — and on the printed route
  // sheets — as unassigned unless someone re-picked the crew it already had.
  const [crewId, setCrewId] = useState(() => {
    const ids = new Set(items.map((i) => i.job.crewId ?? ""));
    return ids.size === 1 ? [...ids][0] : "";
  });

  async function handleDispatch() {
    if (!date) return;
    await Promise.all(
      items.map(({ job, service }) =>
        createVisit.mutateAsync({
          jobId: job.id,
          clientId: job.clientId,
          scheduledDate: date,
          crewId: crewId || null,
          jobServiceId: service?.id ?? null,
          jobType: job.jobType,
        })
      )
    );
    toast.success(
      singleService
        ? `${singleService.serviceName} dispatched for ${date}`
        : `${items.length} job${items.length > 1 ? "s" : ""} dispatched for ${date}`
    );
    onDone();
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {singleService ? `Dispatch — ${singleService.serviceName}` : `Dispatch ${items.length} Job${items.length > 1 ? "s" : ""}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>Crew</Label>
            <Select value={crewId || "unassigned"} onValueChange={(v) => setCrewId(v === "unassigned" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select crew…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {(crews ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleDispatch} disabled={!date || createVisit.isPending}>
            {createVisit.isPending ? "Dispatching…" : "Dispatch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── row ──────────────────────────────────────────────────────────────────────

function WaitingJobRow({
  job,
  service,
  visibleKeys,
  customFieldDefs,
  crewCodeById,
  selected,
  onToggle,
  onSchedule,
  onOpenJob,
}: {
  job: CRMJob;
  /** When set, this row represents one visit within a package job rather than the whole job. */
  service?: CRMJobService | null;
  visibleKeys: string[];
  customFieldDefs: PropertyCustomFieldDef[];
  crewCodeById: Map<string, string>;
  selected: boolean;
  onToggle: () => void;
  onSchedule: () => void;
  onOpenJob: () => void;
}) {
  const serviceName = service
    ? service.serviceName
    : job.services && job.services.length > 0
      ? job.services.map((s) => s.serviceName).join(", ")
      : "—";
  const serviceTotal = (job.services ?? []).reduce(
    (sum, s) => sum + (s.rateCents ?? 0) * (s.qty ?? 1),
    0
  );
  const effectiveRate = service
    ? service.rateCents ?? null
    : job.rateCents ?? (serviceTotal > 0 ? serviceTotal : null);
  const effectiveCrew = (job.crewId && crewCodeById.get(job.crewId)) || job.crewName;
  const isVisible = (key: string) => visibleKeys.includes(key);

  return (
    <tr
      className={cn("cursor-pointer border-b border-slate-100 text-sm hover:bg-slate-50", selected && "bg-brand-50")}
      onClick={onOpenJob}
    >
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="rounded border-slate-300 accent-brand-500"
        />
      </td>
      {isVisible("client") && (
        <td className="min-w-[200px] px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <Link href={`/crm/clients/${job.clientId}`} className="font-medium text-brand-600 hover:underline">
            {job.clientName ?? "—"}
          </Link>
          {job.serviceAddress && (
            <p className="text-xs text-slate-400">{job.serviceAddress}</p>
          )}
        </td>
      )}
      {isVisible("service") && (
        <td className="min-w-[180px] px-4 py-3 text-slate-700">{serviceName}</td>
      )}
      {isVisible("dateRange") && service && (
        <td className="px-4 py-3">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {formatDateRange(service.startDate, service.completeByDate)}
          </span>
        </td>
      )}
      {isVisible("dateRange") && !service && (
        <td className="px-4 py-3">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {formatDateRange(job.waitingListStart, job.waitingListEnd)}
          </span>
        </td>
      )}
      {isVisible("city") && (
        <td className="px-4 py-3 text-slate-500">{job.serviceCity ?? "—"}</td>
      )}
      {isVisible("zip") && (
        <td className="px-4 py-3 text-xs text-slate-400">{job.serviceZip ?? "—"}</td>
      )}
      {isVisible("crew") && (
        <td className="px-4 py-3">
          {effectiveCrew ? (
            <Badge variant="secondary" className="text-xs">
              {effectiveCrew}
            </Badge>
          ) : (
            <span className="text-xs text-slate-400">Unassigned</span>
          )}
        </td>
      )}
      {isVisible("rate") && (
        <td className="px-4 py-3 text-right font-medium text-slate-700">
          {effectiveRate != null ? formatCurrency(effectiveRate) : "—"}
        </td>
      )}
      {isVisible("priority") && (
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1">
            {job.isHighPriority && <span title="High priority"><Flame className="h-3 w-3 text-red-500" /></span>}
            <span className="text-xs capitalize text-slate-500">{job.clientPriority ?? "normal"}</span>
          </div>
        </td>
      )}
      {EXTRA_COLUMNS.filter((c) => c.key !== "priority").map((c) => isVisible(c.key) && (
        <td key={c.key} className="max-w-[160px] truncate px-4 py-3 text-slate-500" title={extraColCellText(c.key, job)}>
          {extraColCellText(c.key, job)}
        </td>
      ))}
      {customFieldDefs.map((def) => {
        const key = customColKey(def.id);
        if (!isVisible(key)) return null;
        const val = job.propertyCustomFieldValues?.find((v) => v.fieldDefId === def.id);
        const display = val ? (val.valueText ?? (val.valueNumber != null ? val.valueNumber.toLocaleString() : null)) ?? "—" : "—";
        return (
          <td key={key} className="max-w-[160px] truncate px-4 py-3 text-slate-500" title={display}>
            {display}
          </td>
        );
      })}
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onSchedule}>
          Schedule
        </Button>
      </td>
    </tr>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

export function WaitingList() {
  const { can, isLoading: permissionsLoading } = usePermissions();
  const today = toLocalDateString(new Date());
  const thirtyOut = toLocalDateString(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  );

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(thirtyOut);
  const [search, setSearch] = useState("");
  const [activeColFilter, setActiveColFilter] = useState<ColFilterKey | null>(null);
  const [colFilterValue, setColFilterValue] = useState("");
  // Service is multi-select (can filter to more than one at once), same as
  // the Dispatch Board's Service filter.
  const [serviceFilters, setServiceFilters] = useState<string[]>([]);
  const [crewFilters, setCrewFilters] = useState<string[]>([]);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [priorityFilters, setPriorityFilters] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [visibleKeys, setVisibleKeys] = usePersistedColumns(
    "waiting_list",
    WAITING_LIST_COLUMNS.map((c) => c.key)
  );
  const [dispatchItems, setDispatchItems] = useState<DispatchItem[] | null>(null);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const { data: jobs, isLoading, refetch } = useWaitingListJobs(startDate, endDate);
  const { data: crews } = useCRMCrews();
  const orgTags = useOrgTags();
  const { data: customFieldDefs = [] } = usePropertyCustomFieldDefs();
  const allColumnDefs = useMemo(
    () => [
      ...WAITING_LIST_COLUMNS,
      // Off by default for everyone, so they don't count toward the chooser's
      // "N hidden" badge — see ColumnDef.defaultHidden.
      ...EXTRA_COLUMNS.map((d) => ({ ...d, defaultHidden: true })),
      ...customFieldDefs.map((d) => ({ key: customColKey(d.id), label: d.name, defaultHidden: true })),
    ],
    [customFieldDefs]
  );
  // The Crew column shows the crew's abbreviated team code when it has one,
  // same as the Dispatch Board's Assigned column.
  const crewCodeById = useMemo(
    () => new Map((crews ?? []).map((c) => [c.id, c.code]).filter((e): e is [string, string] => !!e[1])),
    [crews]
  );

  const all = jobs ?? [];

  const allServices = useMemo(() => {
    const names = new Set<string>();
    for (const job of all) for (const s of job.services ?? []) names.add(s.serviceName);
    return Array.from(names).sort();
  }, [all]);

  const filtered = useMemo(() => {
    let list = all;

    if (crewFilters.length > 0) {
      list = list.filter((job) => job.crewId && crewFilters.includes(job.crewId));
    }
    if (tagFilters.length > 0) {
      list = list.filter((job) => (job.clientTags ?? []).some((t) => tagFilters.includes(t)));
    }
    if (priorityFilters.length > 0) {
      list = list.filter((job) => {
        return (
          (priorityFilters.includes("job_high") && job.isHighPriority) ||
          (priorityFilters.includes("job_normal") && !job.isHighPriority) ||
          (priorityFilters.includes("client_high") && job.clientPriority === "high") ||
          // null means normal here, same as the Priority column's `?? "normal"`
          // — see the matching note on the Dispatch Board's filter.
          (priorityFilters.includes("client_normal") && (job.clientPriority ?? "normal") === "normal") ||
          (priorityFilters.includes("client_low") && job.clientPriority === "low")
        );
      });
    }
    if (serviceFilters.length > 0) {
      list = list.filter((job) => (job.services ?? []).some((s) => serviceFilters.includes(s.serviceName)));
    }

    if (activeColFilter && colFilterValue.trim()) {
      const v = colFilterValue.toLowerCase();
      list = list.filter((job) => {
        switch (activeColFilter) {
          case "client":  return (job.clientName ?? "").toLowerCase().includes(v);
          case "city":    return (job.serviceCity ?? "").toLowerCase().includes(v);
          case "zip":     return (job.serviceZip ?? "").toLowerCase().includes(v);
          case "crew": {
            // Match on either the full crew name or its abbreviated team code,
            // same as the Dispatch Board's Crew text filter.
            const code = job.crewId ? crewCodeById.get(job.crewId) ?? "" : "";
            const name = job.crewName ?? "";
            return name.toLowerCase().includes(v) || code.toLowerCase().includes(v);
          }
          default:        return true;
        }
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((job) =>
        (job.clientName ?? "").toLowerCase().includes(q) ||
        (job.services ?? []).some((s) => s.serviceName.toLowerCase().includes(q))
      );
    }

    return list;
  }, [all, activeColFilter, colFilterValue, search, crewFilters, tagFilters, priorityFilters, serviceFilters, crewCodeById]);

  // Package jobs carry one crm_job_services row per visit, each with its own
  // date window — expand those into one row per visit so each can be scheduled
  // independently instead of the whole job going out on a single date. Any
  // OTHER job type with more than one service (e.g. a waiting-list job added
  // with both "Spring Clean-up" and "Mulch" on it) gets the same treatment —
  // otherwise dispatching creates one combined visit for both services, and
  // there's no way to send one to a different crew than the other.
  const visitRows = useMemo(() => {
    const rows: { key: string; job: CRMJob; service: CRMJobService | null }[] = [];
    for (const job of filtered) {
      const services = job.services ?? [];
      if (job.jobType === "package" && services.length > 0) {
        for (const service of services) {
          // The job-level waiting_list_start/end (used by the server-side date
          // filter) spans the whole package, so a job can pass the filter while
          // individual visits inside it fall outside the selected range — only
          // show visits whose own date window actually overlaps it.
          if (service.completeByDate && service.completeByDate < startDate) continue;
          if (service.startDate && service.startDate > endDate) continue;
          rows.push({ key: `${job.id}-${service.id}`, job, service });
        }
      } else if (services.length > 1) {
        for (const service of services) {
          rows.push({ key: `${job.id}-${service.id}`, job, service });
        }
      } else {
        rows.push({ key: job.id, job, service: null });
      }
    }
    return rows;
  }, [filtered, startDate, endDate]);

  const allSelected = visitRows.length > 0 && visitRows.every((r) => selectedKeys.has(r.key));
  const someSelected = selectedKeys.size > 0;

  function toggleAll() {
    if (allSelected) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(visitRows.map((r) => r.key)));
  }

  function toggleOne(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const colCount = visibleKeys.length + 2; // +1 checkbox, +1 schedule action

  if (!permissionsLoading && !can("sched_waiting_list")) {
    return (
      <EmptyState
        icon={ListOrdered}
        title="No access"
        description="You don't have permission to view the Waiting List."
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Page header */}
      <PageHeader
        title="Waiting List"
        description="Jobs queued for opportunistic scheduling"
        action={
          <Button size="sm" className="h-8 text-xs" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add to Waiting List
          </Button>
        }
      />

      <NewJobDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initialJobType="waiting_list"
        onCreated={() => refetch()}
      />

      {/* Date window */}
      <div className="flex items-center gap-3 rounded-lg border bg-white px-4 py-2.5 shadow-sm">
        <ListOrdered className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="text-sm font-medium text-slate-700">Date Window</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => e.target.value && setStartDate(e.target.value)}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => e.target.value && setEndDate(e.target.value)}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
        <span className="ml-auto text-xs text-slate-400">
          {isLoading ? "…" : `${visitRows.length} jobs`}
        </span>
      </div>

      {/* Select a filter bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-white px-4 py-2">
        <span className="shrink-0 text-xs font-medium text-slate-500 mr-1">Select a Filter:</span>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {COL_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                if (activeColFilter === key) { setActiveColFilter(null); setColFilterValue(""); }
                else { setActiveColFilter(key); setColFilterValue(""); }
              }}
              className={cn(
                "rounded px-2 py-0.5 text-xs transition-colors whitespace-nowrap",
                activeColFilter === key
                  ? "bg-brand-100 text-brand-700 font-medium"
                  : "hover:bg-slate-100 text-slate-600"
              )}
            >
              {label}
            </button>
          ))}

          {/* Service: multi-select popover, same as the Dispatch Board. Placed
              right after the tab buttons and before the text-filter Input
              below, so that Input always docks at the end of the row no
              matter which tab is active — matching the Dispatch Board,
              where every "Select a Filter" tab lives in one group before
              the shared Input. */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "rounded px-2 py-0.5 text-xs transition-colors whitespace-nowrap",
                  serviceFilters.length > 0 ? "bg-brand-100 text-brand-700 font-medium" : "hover:bg-slate-100 text-slate-600"
                )}
              >
                Service{serviceFilters.length > 0 && ` · ${serviceFilters.length}`}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="start">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wide">Services</p>
              {allServices.length === 0 && (
                <p className="px-2 py-2 text-xs text-slate-400 italic">No services found</p>
              )}
              {allServices.map((name) => (
                <FilterOptionRow
                  key={name}
                  checked={serviceFilters.includes(name)}
                  onToggle={() => setServiceFilters((prev) =>
                    prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
                  )}
                  className={serviceFilters.includes(name) ? "bg-brand-50 text-brand-700 font-medium" : undefined}
                >
                  {name}
                </FilterOptionRow>
              ))}
              {serviceFilters.length > 0 && (
                <div className="border-t mt-1 pt-1">
                  <button
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-100"
                    onClick={() => setServiceFilters([])}
                  >
                    <X className="h-3 w-3" /> Clear filter
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {activeColFilter && (
            <>
              <Input
                autoFocus
                value={colFilterValue}
                onChange={(e) => setColFilterValue(e.target.value)}
                placeholder={`Filter by ${COL_FILTERS.find((f) => f.key === activeColFilter)?.label}…`}
                className="ml-2 h-6 w-48 text-xs"
              />
              <button
                onClick={() => { setActiveColFilter(null); setColFilterValue(""); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dark actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 bg-[#4a4a4a] px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 gap-y-1">
          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 bg-[#5a5a5a] border-[#6a6a6a] text-white hover:bg-[#6a6a6a] text-xs px-3"
              >
                Actions
                {someSelected && (
                  <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">{selectedKeys.size}</span>
                )}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                disabled={!someSelected}
                onSelect={() => setDispatchItems(
                  visitRows.filter((r) => selectedKeys.has(r.key)).map((r) => ({ job: r.job, service: r.service }))
                )}
              >
                <Send className="mr-2 h-3.5 w-3.5" />
                Dispatch Selected…
              </DropdownMenuItem>
              {/* Same permission as any other outbound client email
                  (Email Activity's Send), which this bypassed. */}
              {can("email_activity_send") && (
                <DropdownMenuItem
                  disabled={!someSelected}
                  onSelect={() => setBulkEmailOpen(true)}
                >
                  <Mail className="mr-2 h-3.5 w-3.5" />
                  Email Selected Clients
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh */}
          <button
            onClick={() => refetch()}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#6a6a6a] bg-[#5a5a5a] text-white hover:bg-[#6a6a6a]"
            title="Refresh"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {/* Search */}
          <div className="relative ml-2">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-7 w-44 pl-7 text-xs bg-white border-slate-200 focus-visible:ring-0"
            />
          </div>

          {/* Crew: multi-select popover, matched by crew id — same placement
              and style as the Dispatch Board's "All Crews" filter (dark bar,
              not the white "Select a Filter" text-search row). */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="h-7 flex items-center gap-1.5 rounded bg-[#5a5a5a] border border-[#6a6a6a] px-2.5 text-[10px] text-slate-200 hover:text-white transition-colors">
                <Users className="h-3 w-3" />
                {crewFilters.length === 0 ? "All Crews" : `${crewFilters.length} Crew${crewFilters.length > 1 ? "s" : ""}`}
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
              <FilterOptionRow checked={crewFilters.length === 0} onToggle={() => setCrewFilters([])}>
                All Crews
              </FilterOptionRow>
              {(crews ?? []).map((c) => (
                <FilterOptionRow
                  key={c.id}
                  checked={crewFilters.includes(c.id)}
                  onToggle={() => setCrewFilters((prev) =>
                    prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                  )}
                >
                  {c.name}
                </FilterOptionRow>
              ))}
            </PopoverContent>
          </Popover>

          {/* Tag filter — client tags, "is any of" (OR) */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="h-7 flex items-center gap-1.5 rounded bg-[#5a5a5a] border border-[#6a6a6a] px-2.5 text-[10px] text-slate-200 hover:text-white transition-colors">
                <Tag className="h-3 w-3" />
                {tagFilters.length === 0 ? "All Tags" : `${tagFilters.length} Tag${tagFilters.length > 1 ? "s" : ""}`}
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1 max-h-72 overflow-y-auto" align="start">
              <FilterOptionRow checked={tagFilters.length === 0} onToggle={() => setTagFilters([])}>
                All Tags
              </FilterOptionRow>
              {orgTags.length === 0 && (
                <p className="px-2 py-1.5 text-[11px] text-slate-400">No client tags yet</p>
              )}
              {orgTags.map((tag) => (
                <FilterOptionRow
                  key={tag}
                  checked={tagFilters.includes(tag)}
                  onToggle={() => setTagFilters((prev) =>
                    prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
                  )}
                >
                  <span className="truncate">{tag}</span>
                </FilterOptionRow>
              ))}
            </PopoverContent>
          </Popover>

          {/* Priority filter — job high-priority flag + client priority level */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="h-7 flex items-center gap-1.5 rounded bg-[#5a5a5a] border border-[#6a6a6a] px-2.5 text-[10px] text-slate-200 hover:text-white transition-colors">
                <Flame className="h-3 w-3" />
                {priorityFilters.length === 0 ? "All Priorities" : `${priorityFilters.length} Priority${priorityFilters.length > 1 ? "s" : ""}`}
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1" align="start">
              <FilterOptionRow checked={priorityFilters.length === 0} onToggle={() => setPriorityFilters([])}>
                All Priorities
              </FilterOptionRow>
              <div className="my-1 border-t" />
              <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Job</p>
              {PRIORITY_FILTER_JOB_OPTIONS.map((o) => (
                <FilterOptionRow
                  key={o.value}
                  checked={priorityFilters.includes(o.value)}
                  onToggle={() => setPriorityFilters((prev) =>
                    prev.includes(o.value) ? prev.filter((x) => x !== o.value) : [...prev, o.value]
                  )}
                >
                  {o.value === "job_high" && <Flame className="h-3 w-3 text-red-500" />}
                  {o.label}
                </FilterOptionRow>
              ))}
              <div className="my-1 border-t" />
              <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Client</p>
              {PRIORITY_FILTER_CLIENT_OPTIONS.map((o) => (
                <FilterOptionRow
                  key={o.value}
                  checked={priorityFilters.includes(o.value)}
                  onToggle={() => setPriorityFilters((prev) =>
                    prev.includes(o.value) ? prev.filter((x) => x !== o.value) : [...prev, o.value]
                  )}
                >
                  {o.label}
                </FilterOptionRow>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        <ColumnChooser
          columns={allColumnDefs}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-slate-300 accent-brand-500"
                />
              </th>
              {visibleKeys.includes("client") && <th className="min-w-[200px] px-4 py-3">Client</th>}
              {visibleKeys.includes("service") && <th className="min-w-[180px] px-4 py-3">Service</th>}
              {visibleKeys.includes("dateRange") && <th className="px-4 py-3">Date Range</th>}
              {visibleKeys.includes("city") && <th className="px-4 py-3">City</th>}
              {visibleKeys.includes("zip") && <th className="px-4 py-3">Zip</th>}
              {visibleKeys.includes("crew") && <th className="px-4 py-3">Crew</th>}
              {visibleKeys.includes("rate") && <th className="px-4 py-3 text-right">Rate</th>}
              {EXTRA_COLUMNS.map((c) => visibleKeys.includes(c.key) && <th key={c.key} className="px-4 py-3 whitespace-nowrap">{c.label}</th>)}
              {customFieldDefs.map((def) => visibleKeys.includes(customColKey(def.id)) && (
                <th key={def.id} className="px-4 py-3 whitespace-nowrap">{def.name}</th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: colCount }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : visitRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="py-16 text-center text-sm text-slate-400">
                  {search || activeColFilter
                    ? "No jobs match your filters"
                    : "No jobs on the waiting list for this date range"}
                </td>
              </tr>
            ) : (
              visitRows.map(({ key, job, service }) => (
                <WaitingJobRow
                  key={key}
                  job={job}
                  service={service}
                  visibleKeys={visibleKeys}
                  customFieldDefs={customFieldDefs}
                  crewCodeById={crewCodeById}
                  selected={selectedKeys.has(key)}
                  onToggle={() => toggleOne(key)}
                  onSchedule={() => setDispatchItems([{ job, service }])}
                  onOpenJob={() => setSelectedJobId(job.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {dispatchItems && (
        <DispatchJobsDialog
          items={dispatchItems}
          onOpenChange={(open) => { if (!open) setDispatchItems(null); }}
          onDone={() => { setSelectedKeys(new Set()); refetch(); }}
        />
      )}

      <BulkEmailClientsDialog
        open={bulkEmailOpen}
        onClose={() => setBulkEmailOpen(false)}
        clientIds={[...new Set(visitRows.filter((r) => selectedKeys.has(r.key)).map((r) => r.job.clientId))]}
      />

      <JobDetailSheet
        jobId={selectedJobId}
        onOpenChange={(open) => { if (!open) setSelectedJobId(null); }}
      />
    </div>
  );
}
