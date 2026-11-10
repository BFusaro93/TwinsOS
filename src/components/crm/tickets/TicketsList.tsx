"use client";

import { DEFAULT_TICKET_CATEGORIES } from "@/lib/crm/ticket-categories";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useTickets,
  useCreateTicket,
  useUpdateTicket,
  useBulkImportTickets,
  useDeletedTickets,
  useDeleteTicket,
  useRestoreTicket,
} from "@/lib/hooks/use-tickets";
import { ClientCombobox } from "@/components/shared/ClientCombobox";
import { useRequiredFields } from "@/lib/hooks/use-required-fields";
import { useSelectableEmployees } from "@/lib/hooks/use-employees";
import { TicketDetailSheet } from "./TicketDetailSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
// Shared with Settings → Import / Export so both import the same columns.
import { TICKET_REQUIRED_COLUMNS, TICKET_TEMPLATE_COLUMNS } from "@/lib/crm/import-export-columns";
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus, RotateCcw, Trash2, Undo2, Ticket as TicketIcon, UserCheck, X } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SearchInput } from "@/components/shared/SearchInput";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
import { inDateRange } from "@/lib/utils/column-filters";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";

const STATUS_CLASS: Record<TicketStatus, string> = {
  open:    "border border-red-400 text-red-600 dark:text-red-400",
  on_hold: "border border-orange-400 text-orange-600 dark:text-orange-400",
  pending: "border border-transparent bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400",
  closed:  "border border-transparent bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  open:    "Open",
  on_hold: "On Hold",
  pending: "Pending",
  closed:  "Closed",
};

const PRIORITY_CLASS: Record<TicketPriority, string> = {
  urgent: "border border-transparent bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",
  high: "border border-transparent bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400",
  normal: "border border-transparent bg-muted text-slate-600 dark:text-neutral-400",
  low: "border border-transparent bg-slate-50 dark:bg-muted/40 text-slate-400 dark:text-neutral-500",
};

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] leading-4 font-semibold uppercase", STATUS_CLASS[status])}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  if (priority !== "urgent" && priority !== "high") return null;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] leading-4 font-semibold capitalize", PRIORITY_CLASS[priority])}>
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

const FALLBACK_CATEGORIES: string[] = [...DEFAULT_TICKET_CATEGORIES];

// ── NewTicketDialog ───────────────────────────────────────────────────────────

interface NewTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string;
  defaultType?: TicketType;
}

export function NewTicketDialog({ open, onOpenChange, defaultClientId, defaultType = "note" }: NewTicketDialogProps) {
  const { data: employees } = useSelectableEmployees();
  const users = (employees ?? []).map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }));
  const createTicket = useCreateTicket();
  const rf = useRequiredFields("ticket");
  const { data: categoryOptions } = useOrgList("ticket_categories");
  const dialogCategories = categoryOptions && categoryOptions.length > 0
    ? categoryOptions.map((o) => o.value)
    : FALLBACK_CATEGORIES;
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
    visibleToClient: false,
  });

  function set<K extends keyof NewTicketFormValues>(key: K, value: NewTicketFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function missingRequiredField(): string | null {
    // A ticket with no subject and no body is an empty "(no subject)" row in
    // the list that nobody can act on.
    if (!form.subject.trim() && !form.body.trim()) return "Add a subject or details";
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
      visibleToClient: false,
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
                      : "border-border bg-card text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-muted/40"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Client{rf.req("client")}</Label>
            <ClientCombobox
              value={form.clientId ?? ""}
              onValueChange={(v) => set("clientId", v || null)}
              noneLabel="Select client…"
              clearLabel="No client"
            />
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

          <div className="flex items-start justify-between gap-4 rounded-md border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="new-ticket-portal-visible" className="text-sm font-medium">Show in client portal</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {form.clientId
                  ? "The client sees the subject, category, status and notes — never comments or files."
                  : "Pick a client to share this ticket in their portal."}
              </p>
            </div>
            <Switch
              id="new-ticket-portal-visible"
              checked={!!form.clientId && !!form.visibleToClient}
              onCheckedChange={(v) => set("visibleToClient", v)}
              disabled={!form.clientId}
            />
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

type ColFilterKey = "subject" | "client" | "category" | "assigned" | "priority" | "created" | "due";

const COL_FILTERS: { key: ColFilterKey; label: string }[] = [
  { key: "subject",  label: "Subject" },
  { key: "client",   label: "Account" },
  { key: "category", label: "Category" },
  { key: "assigned", label: "Assignment" },
  { key: "priority", label: "Priority" },
  { key: "created",  label: "Created" },
  { key: "due",      label: "Due Date" },
];

// ── TicketsList ───────────────────────────────────────────────────────────────

interface Props {
  clientId?: string;
  typeFilter?: TicketType;
  title?: string;
  description?: string;
}

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

  // ?status=open — dashboard deep-links (My Day's "Open Tickets" card).
  const urlStatus = useSearchParams().get("status");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all" | "deleted">(() =>
    STATUS_TABS.some((t) => t.value === urlStatus) ? (urlStatus as TicketStatus) : "all"
  );
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeColFilter, setActiveColFilter] = useState<ColFilterKey | null>(null);
  const [colFilterValue, setColFilterValue] = useState("");
  const { toISODate } = useOrgDates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // A selection belongs to the tab + search + filters it was made under: once
  // any of them changes, rows that are no longer shown must not stay selected
  // (a bulk Close / Reassign / Delete would otherwise act on tickets the user
  // can't see). Same rule as the Clients and Leads lists.
  const selectionScope = JSON.stringify([statusFilter, priorityFilter, categoryFilter, search, activeColFilter, colFilterValue]);
  const [selectionScopeSeen, setSelectionScopeSeen] = useState(selectionScope);
  if (selectionScopeSeen !== selectionScope) {
    setSelectionScopeSeen(selectionScope);
    setSelectedIds(new Set());
  }
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignId, setReassignId] = useState("");
  const { data: employees } = useSelectableEmployees();
  const users = (employees ?? []).map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }));

  const { data: tickets, isLoading, refetch } = useTickets({ clientId });
  const isDeletedView = statusFilter === "deleted";
  const { data: deletedTickets, isLoading: deletedLoading } = useDeletedTickets({ clientId, enabled: isDeletedView });
  const updateTicket = useUpdateTicket();
  const deleteTicket = useDeleteTicket();
  const restoreTicket = useRestoreTicket();
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { mutateAsync: bulkImportTickets } = useBulkImportTickets();

  const activeAll = tickets ?? [];
  // The "Deleted" view lists soft-deleted tickets; every other view excludes them.
  const all = isDeletedView ? (deletedTickets ?? []) : activeAll;
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
    const typeFiltered = typeFilter ? activeAll.filter((t) => t.type === typeFilter) : activeAll;
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
  }, [activeAll, typeFilter]);

  const STATUS_QUICK: Array<{ key: TicketStatus | "all" | "deleted"; label: string }> = [
    { key: "all",     label: "All" },
    { key: "open",    label: "Open" },
    { key: "on_hold", label: "On Hold" },
    { key: "pending", label: "Pending" },
    { key: "closed",  label: "Closed" },
    { key: "deleted", label: "Deleted" },
  ];

  const quickCounts: Record<TicketStatus | "all" | "deleted", number> = {
    deleted: 0,
    all:     stats.total,
    open:    stats.open,
    on_hold: stats.on_hold,
    pending: stats.pending,
    closed:  stats.closed,
  };

  const filtered = useMemo(() => {
    let list = all;
    if (typeFilter) list = list.filter((t) => t.type === typeFilter);
    if (statusFilter !== "all" && statusFilter !== "deleted") list = list.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
    if (categoryFilter !== "all") list = list.filter((t) => t.category === categoryFilter);

    if (activeColFilter && colFilterValue.trim()) {
      const fv = colFilterValue.toLowerCase();
      list = list.filter((t) => {
        switch (activeColFilter) {
          case "subject":  return (t.subject ?? "").toLowerCase().includes(fv);
          case "client":   return (t.clientName ?? "").toLowerCase().includes(fv);
          // Category, Assignment and Priority are picked from a list (exact match).
          case "category": return (t.category ?? "") === colFilterValue;
          case "assigned": return colFilterValue === "unassigned" ? !t.assignedToId : t.assignedToId === colFilterValue;
          case "priority": return t.priority === colFilterValue;
          // created_at is a UTC instant — compare its org-local day so an evening ticket lands on the day staff saw.
          case "created":  return inDateRange(t.createdAt ? toISODate(new Date(t.createdAt)) : null, colFilterValue);
          case "due":      return inDateRange(t.dueDate, colFilterValue);
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
  }, [all, statusFilter, priorityFilter, categoryFilter, activeColFilter, colFilterValue, search, toISODate]);

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

  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map((id) => deleteTicket.mutateAsync(id)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (succeeded > 0) toast.success(`${succeeded} ticket${succeeded !== 1 ? "s" : ""} deleted`);
    if (failed > 0) toast.error(`Failed to delete ${failed} ticket${failed !== 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
  }

  async function bulkRestore() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map((id) => restoreTicket.mutateAsync(id)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    if (succeeded > 0) toast.success(`${succeeded} ticket${succeeded !== 1 ? "s" : ""} restored`);
    if (failed > 0) toast.error(`Failed to restore ${failed} ticket${failed !== 1 ? "s" : ""}`);
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
        skipAssignNotify: true,
      }))
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;
    // One summary notice for the batch instead of one per ticket (best-effort).
    const reassignedIds = ids.filter((_, i) => results[i].status === "fulfilled");
    if (reassignedIds.length > 0) {
      fetch("/api/crm/tickets/notify-assigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketIds: reassignedIds }),
      }).catch(() => {});
    }
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
    <div className="flex h-full flex-col gap-4 overflow-y-auto lg:overflow-visible">
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
              requiredColumns={TICKET_REQUIRED_COLUMNS}
              onExport={() => {
                // Normal views export live tickets only; the Deleted tab exports
                // its deleted tickets with a "deleted" column (the date deleted)
                // so they can't be mistaken for live ones.
                const toRow = (t: (typeof all)[number]) => ({
                  subject: t.subject ?? "",
                  clientName: t.clientName ?? "",
                  type: t.type,
                  status: t.status,
                  priority: t.priority,
                  category: t.category ?? "",
                  body: t.body ?? "",
                  dueDate: t.dueDate ?? "",
                });
                if (isDeletedView) {
                  exportCSV(
                    (deletedTickets ?? []).filter((t) => !typeFilter || t.type === typeFilter).map((t) => ({ ...toRow(t), deleted: (t.deletedAt ?? "").slice(0, 10) })),
                    "tickets-deleted-export.csv"
                  );
                } else {
                  exportCSV(
                    activeAll.filter((t) => !t.deletedAt && (!typeFilter || t.type === typeFilter)).map(toRow),
                    "tickets-export.csv"
                  );
                }
              }}
              onImport={async (rows) => {
                const result = await bulkImportTickets(rows);
                const { succeeded, failed } = result;
                if (failed.length > 0) {
                  toast.warning(`Imported ${succeeded} ticket${succeeded !== 1 ? "s" : ""}. ${failed.length} row${failed.length !== 1 ? "s" : ""} failed — see details below.`);
                } else {
                  toast.success(`Successfully imported ${succeeded} ticket${succeeded !== 1 ? "s" : ""}.`);
                }
                return result;
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
      <div className="grid shrink-0 grid-cols-5 gap-1.5 sm:gap-3">
        {(typeFilter === "call"
          ? [
              { label: "Total Calls",  value: stats.typeTotal,  color: "text-slate-900 dark:text-neutral-100" },
              { label: "This Week",    value: stats.thisWeek,   color: "text-blue-600 dark:text-blue-400" },
              { label: "This Month",   value: stats.thisMonth,  color: "text-indigo-600 dark:text-indigo-400" },
              { label: "Open",         value: stats.open,       color: "text-red-600 dark:text-red-400" },
              { label: "Closed",       value: stats.closed,     color: "text-green-600 dark:text-green-400" },
            ]
          : [
              { label: "Total",   value: stats.total,   color: "text-slate-900 dark:text-neutral-100" },
              { label: "Open",    value: stats.open,    color: "text-red-600 dark:text-red-400" },
              { label: "On Hold", value: stats.on_hold, color: "text-orange-600 dark:text-orange-400" },
              { label: "Pending", value: stats.pending, color: "text-yellow-600 dark:text-yellow-400" },
              { label: "Closed",  value: stats.closed,  color: "text-green-600 dark:text-green-400" },
            ]
        ).map((s) => (
          <div key={s.label} className="rounded-lg border bg-card px-1 py-2 shadow-sm text-center sm:p-4">
            <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500 sm:text-[10px] sm:tracking-widest">{s.label}</p>
            <p className={`mt-0.5 text-lg font-bold sm:mt-1 sm:text-2xl ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* White column filter bar */}
      <div className="flex items-center gap-1.5 border-b bg-card px-4 py-2">
        <span className="shrink-0 text-xs font-medium text-muted-foreground mr-1">Select a Filter:</span>
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
                  ? "bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400 font-medium"
                  : "hover:bg-muted text-slate-600 dark:text-neutral-400"
              )}
            >
              {label}
            </button>
          ))}
          {activeColFilter && (
            <>
              {activeColFilter === "category" || activeColFilter === "assigned" || activeColFilter === "priority" ? (
                <select
                  autoFocus
                  value={colFilterValue}
                  onChange={(e) => setColFilterValue(e.target.value)}
                  aria-label={`Filter by ${COL_FILTERS.find((f) => f.key === activeColFilter)?.label}`}
                  className="ml-2 h-6 w-48 rounded-md border border-input bg-background px-1 text-xs"
                >
                  <option value="">Select…</option>
                  {/* Org categories plus any a ticket still carries from a retired one. */}
                  {activeColFilter === "category" && Array.from(new Set([...categories, ...all.map((t) => t.category).filter((c): c is string => !!c)])).map((c) => <option key={c} value={c}>{c}</option>)}
                  {activeColFilter === "assigned" && (
                    <>
                      <option value="unassigned">Unassigned</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </>
                  )}
                  {activeColFilter === "priority" && PRIORITY_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : activeColFilter === "created" || activeColFilter === "due" ? (
                <DateRangeFilter
                  value={colFilterValue}
                  onChange={setColFilterValue}
                  label={activeColFilter === "created" ? "Created" : "Due date"}
                />
              ) : (
                <Input
                  autoFocus
                  value={colFilterValue}
                  onChange={(e) => setColFilterValue(e.target.value)}
                  placeholder={`Filter by ${COL_FILTERS.find((f) => f.key === activeColFilter)?.label}…`}
                  className="ml-2 h-6 w-48 text-xs"
                />
              )}
              <button
                onClick={() => { setActiveColFilter(null); setColFilterValue(""); }}
                className="text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-400"
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
              {isDeletedView ? (
                <DropdownMenuItem disabled={!someSelected} onSelect={bulkRestore}>
                  <Undo2 className="mr-2 h-3.5 w-3.5" />
                  Restore
                </DropdownMenuItem>
              ) : (<>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!someSelected}
                className="text-red-600 focus:text-red-600"
                onSelect={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
              </>)}
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
                onClick={() => { if (key === "deleted" || isDeletedView) setSelectedIds(new Set()); setStatusFilter(key); }}
                className={cn(
                  "flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                  statusFilter === key
                    ? "bg-card text-slate-800 dark:text-neutral-100"
                    : "text-slate-300 hover:text-white"
                )}
              >
                {label}
                {key !== "deleted" && quickCounts[key] > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    statusFilter === key ? "bg-slate-200 dark:bg-neutral-700 text-slate-700 dark:text-neutral-300" : "bg-white/20 text-white"
                  )}>
                    {quickCounts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search…"
            className="ml-2 w-44"
            inputClassName="h-7 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <div className="shrink-0 overflow-x-auto bg-card lg:min-h-0 lg:flex-1 lg:shrink lg:overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 dark:bg-muted/40 border-b z-10">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-slate-300 dark:border-neutral-700 accent-brand-500"
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
            {(isDeletedView ? deletedLoading : isLoading) ? (
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
                <td colSpan={colCount} className="py-16 text-center text-sm text-slate-400 dark:text-neutral-500">
                  {search ? `No ${listTypeLabel.toLowerCase()}s match your search` : `No ${listTypeLabel.toLowerCase()}s yet`}
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr
                  key={t.id}
                  className={cn("border-b hover:bg-slate-50 dark:hover:bg-muted/40 cursor-pointer", selectedIds.has(t.id) && "bg-brand-50 dark:bg-brand-900/30")}
                  onClick={() => setSelectedTicketId(t.id)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleOne(t.id)}
                      className="rounded border-slate-300 dark:border-neutral-700 accent-brand-500"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400 dark:text-neutral-500">
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
                        <Link href={`/crm/clients/${t.clientId}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
                          {t.clientName ?? "—"}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-400 dark:text-neutral-500">{t.clientName ?? "—"}</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-slate-800 dark:text-neutral-100 font-medium">
                    {t.subject ?? "(no subject)"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{t.category ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{t.assignedTo ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(t.dueDate)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(t.updatedAt)}</td>
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

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} ticket{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will be removed from the list. You can bring them back from the Deleted view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={bulkDelete} disabled={deleteTicket.isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
