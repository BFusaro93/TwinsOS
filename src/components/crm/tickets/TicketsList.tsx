"use client";

import { useState } from "react";
import {
  useTickets,
  useCreateTicket,
} from "@/lib/hooks/use-tickets";
import { useClients } from "@/lib/hooks/use-clients";
import { TicketDetailSheet } from "./TicketDetailSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Plus, Search } from "lucide-react";
import type {
  CRMTicket,
  TicketStatus,
  TicketType,
  TicketPriority,
  NewTicketFormValues,
} from "@/types/crm-tickets";

const STATUS_CLASS: Record<TicketStatus, string> = {
  open: "border border-red-400 text-red-600",
  closed: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
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
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
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
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Pending", value: "pending" },
  { label: "Closed", value: "closed" },
];

const PRIORITY_OPTIONS: Array<{ label: string; value: TicketPriority | "all" }> = [
  { label: "All Priorities", value: "all" },
  { label: "Urgent", value: "urgent" },
  { label: "High", value: "high" },
  { label: "Normal", value: "normal" },
  { label: "Low", value: "low" },
];

const CATEGORIES = [
  "Uncategorized",
  "Estimate",
  "Billing",
  "Client Portal Message",
  "Need to Contact Customer",
];

const CATEGORY_OPTIONS = [{ label: "All Categories", value: "all" }, ...CATEGORIES.map((c) => ({ label: c, value: c }))];

// ── NewTicketDialog ───────────────────────────────────────────────────────────

interface NewTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string;
}

export function NewTicketDialog({ open, onOpenChange, defaultClientId }: NewTicketDialogProps) {
  const { data: clients } = useClients();
  const createTicket = useCreateTicket();

  const [form, setForm] = useState<NewTicketFormValues>({
    type: "note",
    clientId: defaultClientId ?? null,
    category: "Uncategorized",
    subject: "",
    body: "",
    status: "open",
    assignedTo: "",
    dueDate: "",
    priority: "normal",
  });

  function set<K extends keyof NewTicketFormValues>(key: K, value: NewTicketFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    await createTicket.mutateAsync(form);
    onOpenChange(false);
    setForm({
      type: "note",
      clientId: defaultClientId ?? null,
      category: "Uncategorized",
      subject: "",
      body: "",
      status: "open",
      assignedTo: "",
      dueDate: "",
      priority: "normal",
    });
  }

  const TYPE_OPTS: Array<{ label: string; value: TicketType }> = [
    { label: "Note", value: "note" },
    { label: "Call", value: "call" },
    { label: "Event", value: "event" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Ticket</DialogTitle>
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
            <Label>Client</Label>
            <Select
              value={form.clientId ?? "none"}
              onValueChange={(v) => set("clientId", v === "none" ? null : v)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select client…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client</SelectItem>
                {(clients ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
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
              placeholder="Ticket subject…"
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
              <Label>Assigned To</Label>
              <Input
                value={form.assignedTo}
                onChange={(e) => set("assignedTo", e.target.value)}
                className="h-9 text-sm"
                placeholder="Name…"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Due Date</Label>
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
          <Button size="sm" onClick={handleSave} disabled={createTicket.isPending}>
            {createTicket.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── TicketsList ───────────────────────────────────────────────────────────────

interface Props {
  clientId?: string;
}

export function TicketsList({ clientId }: Props) {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<CRMTicket | null>(null);

  const { data: tickets, isLoading } = useTickets({
    status: statusFilter === "all" ? undefined : statusFilter,
    clientId,
  });

  const filtered = (tickets ?? []).filter((t) => {
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (t.subject ?? "").toLowerCase().includes(q) ||
      (t.clientName ?? "").toLowerCase().includes(q)
    );
  });

  const colCount = clientId ? 8 : 9;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Page header */}
      <PageHeader
        title="Tickets"
        description="Support and service tickets"
      />

      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap px-4">
        <span className="sr-only">Tickets</span>

        {/* Status tabs */}
        <div className="flex gap-1 rounded-lg border bg-slate-50 p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                statusFilter === tab.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Priority filter */}
        <Select
          value={priorityFilter}
          onValueChange={(v) => setPriorityFilter(v as TicketPriority | "all")}
        >
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Category filter */}
        <Select
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v)}
        >
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets…"
            className="h-8 pl-8 text-sm"
          />
        </div>

        <div className="ml-auto">
          <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Ticket
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Ticket #</th>
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
                  {search ? "No tickets match your search" : "No tickets yet"}
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr
                  key={t.id}
                  className="border-b hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelectedTicket(t)}
                >
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">
                    #{t.ticketNumber}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  {!clientId && (
                    <td className="px-4 py-3 text-blue-600 hover:underline font-medium">
                      {t.clientName ?? "—"}
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
      />

      <TicketDetailSheet
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
      />
    </div>
  );
}
