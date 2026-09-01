"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useTickets,
  useCreateTicket,
  useUpdateTicket,
  useBulkImportTickets,
} from "@/lib/hooks/use-tickets";
import { useClients } from "@/lib/hooks/use-clients";
import { useRequiredFields } from "@/lib/hooks/use-required-fields";
import { useSelectableEmployees } from "@/lib/hooks/use-employees";
import { TicketDetailSheet } from "./TicketDetailSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus, RotateCcw, Search, Ticket as TicketIcon, UserCheck, X } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { toast } from "sonner";
import { useOrgList } from "@/lib/hooks/use-org-lists";
import type {
  CRMTicket,
  TicketStatus,
  TicketType,
  TicketPriority,
  NewTicketFormValues,
} from "@/types/crm-tickets";

const STATUS_CLASS: Record<TicketStatus, string> = {
  open:    "border border-red-400 text-red-600",
  on_hold: "border border-orange-400 text-orange-600",
  pending: "bg-yellow-100 text-yellow-700",
  closed:  "bg-green-100 text-green-700",
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  open:    "Open",
  on_hold: "On Hold",
  pending: "Pending",
  closed:  "Closed",
};

const PRIORITY_CLASS: Record<TicketPriority, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  normal: "bg-slate-100 text-slate-600",
  low: "bg-slate-50 text-slate-400",
};

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", STATUS_CLASS[status])}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  if (priority !== "urgent" && priority !== "high") return null;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", PRIORITY_CLASS[priority])}>
      {priority}
    </span>
  );
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + (d.includes("T") ? "" : "T12:00:00")).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ── filter options ────────────────────────────────────────────────────────────

const STATUS_TABS: Array<{ label: string; value: TicketStatus | "all" }> = [
  { label: "All",     value: "all" },
  { label: "Open",    value: "open" },
  { label: "On Hold", value: "on_hold" },
  { label: "Pending", value: "pending" },
  { label: "Closed",  value: "closed" },
];

const PRIORITY_OPTIONS: Array<{ label: string; value: TicketPriority | "all" }> = [
  { label: "All Priorities", value: "all" },
  { label: "Urgent", value: "urgent" },
  { label: "High", value: "high" },
  { label: "Normal", value: "normal" },
  { label: "Low", value: "low" },
];

const FALLBACK_CATEGORIES = ["Uncategorized", "Estimate", "Billing", "Change Service", "Complaint", "Other"];

// ── NewTicketDialog ───────────────────────────────────────────────────────────

interface NewTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string;
  defaultType?: TicketType;
}

export function NewTicketDialog({ open, onOpenChange, defaultClientId, defaultType = "note" }: NewTicketDialogProps) {
  const { data: clients } = useClients();
  const { data: employees } = useSelectableEmployees();
  const users = (employees ?? []).map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }));
  const createTicket = useCreateTicket();
  const rf = useRequiredFields("ticket");
  const { data: categoryOptions } = useOrgList("ticket_categories");
  const dialogCategories = categoryOptions && categoryOptions.length > 0
    ? categoryOptions.map((o) => o.value)
    : FALLBACK_CATEGORIES;
  const [clientSearch, setClientSearch] = useState("");
  const [clientDropOpen, setClientDropOpen] = useState(false);

  const filteredClients = useMemo(() => {
    const all = clients ?? [];
    if (!clientSearch.trim()) return all;
    const q = clientSearch.toLowerCase();
    return all.filter((c) => c.displayName.toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const [form, setForm] = useState<NewTicketFormValues>({
    type: defaultType,
    clientId: defaultClientId ?? null,
    category: "Uncategorized",
    subject: "",
    body: "",
    status: "open",
    assignedTo: "",
    assignedToId: null,
    dueDate: "",
    priority: "normal",
  });

  function set<K extends keyof NewTicketFormValues>(key: K, value: NewTicketFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function missingRequiredField(): string | null {
    if (rf.isRequired("client") && !form.clientId) return "Client is required";
    if (rf.isRequired("assigned_to") && !form.assignedTo.trim()) return "Assigned To is required";
    if (rf.isRequired("due_date") && !form.dueDate.trim()) return "Due Date is required";
    return null;
  }

  async function handleSave() {
    const missing = missingRequiredField();
    if (missing) { toast.error(missing); return; }
    try {
      await createTicket.mutateAsync(form);
    } catch {
      toast.error("Failed to create ticket");
      return;
    }
    onOpenChange(false);
    setForm({
      type: defaultType,
      clientId: defaultClientId ?? null,
      category: "Uncategorized",
      subject: "",
      body: "",
      status: "open",
      assignedTo: "",
      assignedToId: null,
      dueDate: "",
      priority: "normal",
    });
  }

  const TYPE_OPTS: Array<{ label: string; value: TicketType }> = [
    { label: "Note", value: "note" },
    { label: "Call", value: "call" },
    { label: "Event", value: "event" },
  ];
  const typeLabel = form.type === "call" ? "Call" : form.type === "event" ? "Event" : form.type === "text" ? "Text" : "Ticket";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New {typeLabel}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex gap-1">
              {TYPE_OPTS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set("type", t.value)}
                  className={cn(
                    "flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    form.type === t.value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Client{rf.req("client")}</Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setClientDropOpen((o) => !o)}
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <span className={form.clientId ? "text-slate-900" : "text-slate-400"}>
                  {form.clientId
                    ? (clients ?? []).find((c) => c.id === form.clientId)?.displayName ?? "Select client…"
                    : "Select client…"}
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
              </button>
              {clientDropOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
                  <div className="relative border-b">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      autoFocus
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Search clients…"
                      className="w-full py-1.5 pl-9 pr-2 text-sm focus:outline-none"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto py-1">
                    <button
                      type="button"
                      className="w-full px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-50"
                      onClick={() => { set("clientId", null); setClientDropOpen(false); setClientSearch(""); }}
                    >
                      No client
                    </button>
                    {filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={cn(
                          "w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50",
                          form.clientId === c.id ? "bg-brand-50 text-brand-700 font-medium" : "text-slate-800"
                        )}
                        onClick={() => { set("clientId", c.id); setClientDropOpen(false); setClientSearch(""); }}
                      >
                        {c.displayName}
                      </button>
                    ))}
                    {filteredClients.length === 0 && (
                      <p className="px-3 py-2 text-sm text-slate-400">No clients found</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dialogCategories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
              className="h-9 text-sm"
              placeholder={`${typeLabel} subject…`}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              rows={4}
              className="text-sm"
              placeholder="Details…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v as TicketStatus)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => set("priority", v as TicketPriority)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Assigned To{rf.req("assigned_to")}</Label>
              <Select
                value={form.assignedToId || "unassigned"}
                onValueChange={(v) => {
                  if (v === "unassigned") {
                    setForm((prev) => ({ ...prev, assignedTo: "", assignedToId: null }));
                    return;
                  }
                  const user = (users ?? []).find((u) => u.id === v);
                  setForm((prev) => ({ ...prev, assignedTo: user?.name ?? "", assignedToId: v }));
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select user…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {(users ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Due Date{rf.req("due_date")}</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={createTicket.isPending || !!missingRequiredField()}>
            {createTicket.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── column filter config ──────────────────────────────────────────────────────

type ColFilterKey = "subject" | "client" | "category" | "assigned" | "priority";

const COL_FILTERS: { key: ColFilterKey; label: string }[] = [
  { key: "subject",  label: "Subject" },
  { key: "client",   label: "Account" },
  { key: "category", label: "Category" },
  { key: "assigned", label: "Assignment" },
  { key: "priority", label: "Priority" },
];

// ── TicketsList ───────────────────────────────────────────────────────────────

interface Props {
  clientId?: string;
  typeFilter?: TicketType;
  title?: string;
  description?: string;
}

const TICKET_TEMPLATE_COLUMNS = ["subject", "clientName", "type", "status", "priority", "category", "body", "dueDate"];

// useSearchParams (for the ?open= deep-link) requires a Suspense boundary
// around anything reading it during prerendering — wrap the real component
// here so every call site (tickets page, calls page, quick-add, client
// detail panel) is covered without needing its own boundary.
export function TicketsList(props: Props) {
  return (
    <Suspense fallback={null}>
      <TicketsListInner {...props} />
    </Suspense>
  );
}

function TicketsListInner({ clientId, typeFilter, title = "Tickets", description = "Support and service tickets" }: Props) {
  const { can, isLoading: permissionsLoading } = usePermissions();
  const canAdd = typeFilter === "call" ? can("tickets_add_calls") : can("tickets_add_notes");
  const listTypeLabel = typeFilter === "call" ? "Call" : typeFilter === "event" ? "Event" : typeFilter === "text" ? "Text" : "Ticket";
  const { data: categoryOptions } = useOrgList("ticket_categories");
  const categories = categoryOptions && categoryOptions.length > 0
    ? categoryOptions.map((o) => o.value)
    : FALLBACK_CATEGORIES;

  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeColFilter, setActiveColFilter] = useState<ColFilterKey | null>(null);
  const [colFilterValue, setColFilterValue] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignId, setReassignId] = useState("");
  const { data: employees } = useSelectableEmployees();
  const users = (employees ?? []).map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }));

  const { data: tickets, isLoading, refetch } = useTickets({ clientId });
  const updateTicket = useUpdateTicket();
  const { mutateAsync: bulkImportTickets } = useBulkImportTickets();

  const all = tickets ?? [];
  const selectedTicket = selectedTicketId ? all.find((t) => t.id === selectedTicketId) ?? null : null;

  // Deep-link support: /crm/tickets?open=<ticketId> auto-opens the ticket's
  // detail sheet (same convention as InvoicesList's ?open= param).
  const searchParams = useSearchParams();
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId && all.some((t) => t.id === openId)) {
      setSelectedTicketId(openId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, tickets]);

  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const typeFiltered = typeFilter ? all.filter((t) => t.type === typeFilter) : all;
    return {
      open:      typeFiltered.filter((t) => t.status === "open").length,
      on_hold:   typeFiltered.filter((t) => t.status === "on_hold").length,
      pending:   typeFiltered.filter((t) => t.status === "pending").length,
      closed:    typeFiltered.filter((t) => t.status === "closed").length,
      total:     typeFiltered.length,
      thisWeek:  typeFiltered.filter((t) => t.createdAt && new Date(t.createdAt) >= weekStart).length,
      thisMonth: typeFiltered.filter((t) => t.createdAt && new Date(t.createdAt) >= monthStart).length,
      typeTotal: typeFiltered.length,
    };
  }, [all, typeFilter]);

  const STATUS_QUICK: Array<{ key: TicketStatus | "all"; label: string }> = [
    { key: "all",     label: "All" },
    { key: "open",    label: "Open" },
    { key: "on_hold", label: "On Hold" },
    { key: "pending", label: "Pending" },
    { key: "closed",  label: "Closed" },
  ];

  const quickCounts: Record<TicketStatus | "all", number> = {
    all:     stats.total,
    open:    stats.open,
    on_hold: stats.on_hold,
    pending: stats.pending,
    closed:  stats.closed,
  };

  const filtered = useMemo(() => {
    let list = all;
    if (typeFilter) list = list.filter((t) => t.type === typeFilter);
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
    if (categoryFilter !== "all") list = list.filter((t) => t.category === categoryFilter);

    if (activeColFilter && colFilterValue.trim()) {
      const fv = colFilterValue.toLowerCase();
      list = list.filter((t) => {
        switch (activeColFilter) {
          case "subject":  return (t.subject ?? "").toLowerCase().includes(fv);
          case "client":   return (t.clientName ?? "").toLowerCase().includes(fv);
          case "category": return (t.category ?? "").toLowerCase().includes(fv);
          case "assigned": return (t.assignedTo ?? "").toLowerCase().includes(fv);
          case "priority": return t.priority.toLowerCase().includes(fv);
          default:         return true;
        }
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        (t.subject ?? "").toLowerCase().includes(q) ||
        (t.clientName ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [all, statusFilter, priorityFilter, categoryFilter, activeColFilter, colFilterValue, search]);

  const colCount = clientId ? 9 : 10; // +1 for checkbox

  const allSelected = filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0;

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((t) => t.id)));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkSetStatus(status: TicketStatus) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const results = await Promise.allSettled(
      ids.map((id) => updateTicket.mutateAsync({ id, updates: { status } }))
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (succeeded > 0) toast.success(`${succeeded} ticket${succeeded !== 1 ? "s" : ""} marked ${status}`);
    if (failed > 0) toast.error(`Failed to update ${failed} ticket${failed !== 1 ? "s" : ""}`);
    setSelectedIds(new Set());
  }

  async function bulkReassign() {
    if (!reassignId) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const user = (users ?? []).find((u) => u.id === reassignId);
    if (!user) return;
    const results = await Promise.allSettled(
      ids.map((id) => updateTicket.mutateAsync({
        id,
        updates: { assignedTo: user.name, assignedToId: user.id },
      }))
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (succeeded > 0) toast.success(`${succeeded} ticket${succeeded !== 1 ? "s" : ""} reassigned to ${user.name}`);
    if (failed > 0) toast.error(`Failed to reassign ${failed} ticket${failed !== 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    setReassignOpen(false);
    setReassignId("");
  }

  if (!permissionsLoading && !can("tickets_view_modify")) {
    return (
      <EmptyState
        icon={TicketIcon}
        title="No access"
        description={`You don't have permission to view ${title}.`}
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Page header */}
      <PageHeader
        title={title}
        description={description}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ImportExportMenu
              entityLabel={title}
              templateColumns={TICKET_TEMPLATE_COLUMNS}
              templateFilename="tickets-template.csv"
              requiredColumns={["subject"]}
              onExport={() =>
                exportCSV(
                  all.map((t) => ({
                    subject: t.subject ?? "",
                    clientName: t.clientName ?? "",
                    type: t.type,
                    status: t.status,
                    priority: t.priority,
                    category: t.category ?? "",
                    body: t.body ?? "",
                    dueDate: t.dueDate ?? "",
                  })),
                  "tickets-export.csv"
                )
              }
              onImport={async (rows) => {
                const { created, skipped } = await bulkImportTickets(rows);
                if (skipped > 0) {
                  toast.warning(`Imported ${created} ticket${created !== 1 ? "s" : ""}. ${skipped} row${skipped !== 1 ? "s" : ""} skipped (missing subject).`);
                } else {
                  toast.success(`Successfully imported ${created} ticket${created !== 1 ? "s" : ""}.`);
                }
              }}
            />
            {canAdd && (
              <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add {typeFilter === "call" ? "Call" : typeFilter === "event" ? "Event" : typeFilter === "text" ? "Text" : "Ticket"}
              </Button>
            )}
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(typeFilter === "call"
          ? [
              { label: "Total Calls",  value: stats.typeTotal,  color: "text-slate-900" },
              { label: "This Week",    value: stats.thisWeek,   color: "text-blue-600" },
              { label: "This Month",   value: stats.thisMonth,  color: "text-indigo-600" },
              { label: "Open",         value: stats.open,       color: "text-red-600" },
              { label: "Closed",       value: stats.closed,     color: "text-green-600" },
            ]
          : [
              { label: "Total",   value: stats.total,   color: "text-slate-900" },
              { label: "Open",    value: stats.open,    color: "text-red-600" },
              { label: "On Hold", value: stats.on_hold, color: "text-orange-600" },
              { label: "Pending", value: stats.pending, color: "text-yellow-600" },
              { label: "Closed",  value: stats.closed,  color: "text-green-600" },
            ]
        ).map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-4 shadow-sm text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* White column filter bar */}
      <div className="flex items-center gap-1.5 border-b bg-white px-4 py-2">
        <span className="shrink-0 text-xs font-medium text-slate-500 mr-1">Select a Filter:</span>
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
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
      <div className="flex items-center justify-between flex-wrap gap-y-2 bg-[#4a4a4a] px-4 py-2">
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
                  <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">{selectedIds.size}</span>
                )}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {canAdd && (
                <>
                  <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add {typeFilter === "call" ? "Call" : typeFilter === "event" ? "Event" : typeFilter === "text" ? "Text" : "Ticket"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                disabled={!someSelected}
                onSelect={() => bulkSetStatus("open")}
              >
                Mark Open
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!someSelected}
                onSelect={() => bulkSetStatus("pending")}
              >
                Mark Pending
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!someSelected}
                onSelect={() => bulkSetStatus("closed")}
              >
                Mark Closed
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!someSelected}
                onSelect={() => bulkSetStatus("on_hold")}
              >
                Mark On Hold
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!someSelected}
                onSelect={() => setReassignOpen(true)}
              >
                <UserCheck className="mr-2 h-3.5 w-3.5" />
                Reassign
              </DropdownMenuItem>
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

          {/* Quick-filter tabs */}
          <div className="ml-2 flex min-w-0 items-center gap-1 overflow-x-auto">
            {STATUS_QUICK.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={cn(
                  "flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                  statusFilter === key
                    ? "bg-white text-slate-800"
                    : "text-slate-300 hover:text-white"
                )}
              >
                {label}
                {quickCounts[key] > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    statusFilter === key ? "bg-slate-200 text-slate-700" : "bg-white/20 text-white"
                  )}>
                    {quickCounts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

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
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 border-b z-10">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-slate-300 accent-brand-500"
                />
              </th>
              <th className="px-4 py-3">{listTypeLabel} #</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Priority</th>
              {!clientId && <th className="px-4 py-3">Account</th>}
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Assignment</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3">Last Updated</th>
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
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="py-16 text-center text-sm text-slate-400">
                  {search ? `No ${listTypeLabel.toLowerCase()}s match your search` : `No ${listTypeLabel.toLowerCase()}s yet`}
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr
                  key={t.id}
                  className={cn("border-b hover:bg-slate-50 cursor-pointer", selectedIds.has(t.id) && "bg-brand-50")}
                  onClick={() => setSelectedTicketId(t.id)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleOne(t.id)}
                      className="rounded border-slate-300 accent-brand-500"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    #{t.ticketNumber}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  {!clientId && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {t.clientId ? (
                        <Link href={`/crm/clients/${t.clientId}`} className="font-medium text-brand-600 hover:underline">
                          {t.clientName ?? "—"}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-400">{t.clientName ?? "—"}</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-slate-800 font-medium">
                    {t.subject ?? "(no subject)"}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{t.category ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{t.assignedTo ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDate(t.dueDate)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDate(t.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <NewTicketDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultClientId={clientId}
        defaultType={typeFilter}
      />

      <TicketDetailSheet
        ticket={selectedTicket}
        onClose={() => setSelectedTicketId(null)}
      />

      {/* Reassign dialog */}
      {reassignOpen && (
        <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Reassign {selectedIds.size} Ticket{selectedIds.size > 1 ? "s" : ""}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5 py-2">
              <Label>Assign To</Label>
              <Select value={reassignId} onValueChange={setReassignId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select user…" />
                </SelectTrigger>
                <SelectContent>
                  {(users ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => { setReassignOpen(false); setReassignId(""); }}>Cancel</Button>
              <Button size="sm" onClick={bulkReassign} disabled={!reassignId || updateTicket.isPending}>
                {updateTicket.isPending ? "Saving…" : "Reassign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
