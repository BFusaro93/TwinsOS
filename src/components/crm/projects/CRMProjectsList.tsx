"use client";

import { useState } from "react";
import { useProjects, useCreateProject, useUpdateProject } from "@/lib/hooks/use-projects";
import { useClients } from "@/lib/hooks/use-clients";
import { useInvoices } from "@/lib/hooks/use-invoices";
import { usePayments } from "@/lib/hooks/use-invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { Plus, Search, Pencil, FileText, TrendingUp, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import type { Project, ProjectStatus } from "@/types/project";

// ── constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: ProjectStatus[] = [
  "sold", "scheduled", "in_progress", "complete", "on_hold", "canceled",
];

const STATUS_COLOR: Record<ProjectStatus, string> = {
  sold:        "bg-blue-100 text-blue-700 border-blue-200",
  scheduled:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  in_progress: "bg-brand-100 text-brand-700 border-brand-200",
  complete:    "bg-green-100 text-green-700 border-green-200",
  on_hold:     "bg-orange-100 text-orange-700 border-orange-200",
  canceled:    "bg-red-100 text-red-600 border-red-200",
};

function statusLabel(s: ProjectStatus) {
  return s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = clamped >= 100 ? "bg-green-500" : clamped >= 50 ? "bg-brand-500" : "bg-yellow-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-600">{clamped.toFixed(0)}%</span>
    </div>
  );
}

// ── milestone tab (stub) ──────────────────────────────────────────────────────

function MilestoneTab({ project }: { project: Project }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-500">
        <p className="font-medium text-slate-700 mb-1">Milestones</p>
        <p>Sub-jobs and milestones for <span className="font-medium">{project.name}</span> will appear here. Assign jobs to this project from the Dispatch Board or Job detail.</p>
      </div>
    </div>
  );
}

// ── billing tab ───────────────────────────────────────────────────────────────

type BillingFilter = "all" | "invoice" | "payment" | "credit";

function BillingTab({ project }: { project: Project }) {
  const [filter, setFilter] = useState<BillingFilter>("all");
  const { data: invoices } = useInvoices(project.clientId ?? undefined);
  const { data: payments } = usePayments(project.clientId ?? undefined);

  const rows = [
    ...(invoices ?? []).map((inv) => ({
      type: "Invoice" as const,
      date: inv.invoiceDate,
      ref: String(inv.invoiceNumber),
      memo: inv.description,
      status: inv.status,
      totalCents: inv.totalCents,
    })),
    ...(payments ?? []).map((p) => ({
      type: "Payment" as const,
      date: p.paymentDate,
      ref: p.reference ?? "",
      memo: p.memo ?? "",
      status: "",
      totalCents: p.amountCents,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filtered = filter === "all" ? rows : rows.filter((r) => r.type.toLowerCase() === filter);

  return (
    <div className="space-y-3">
      {/* filter bar */}
      <div className="flex items-center gap-2">
        <div className="rounded bg-[#4a4a4a] px-2 py-1">
          <span className="text-xs font-semibold text-white">Actions</span>
        </div>
        {(["all", "invoice", "payment", "credit"] as BillingFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* table */}
      <div className="overflow-auto rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Reference #</th>
              <th className="px-3 py-2">Memo</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs text-slate-400">
                  No {filter === "all" ? "billing activity" : `${filter}s`} yet
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-600">
                    {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", {
                      month: "numeric", day: "numeric", year: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-700">{r.type}</td>
                  <td className="px-3 py-2 text-brand-600">{r.ref}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{r.memo}</td>
                  <td className={`px-3 py-2 text-xs font-medium ${
                    r.status === "overdue" || r.status.includes("Past Due") ? "text-red-600" : "text-slate-600"
                  }`}>
                    {r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : ""}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-slate-800">
                    {formatCurrency(r.totalCents)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── analysis tab ──────────────────────────────────────────────────────────────

function AnalysisTab({ project }: { project: Project }) {
  const { data: invoices } = useInvoices(project.clientId ?? undefined);
  const { data: payments } = usePayments(project.clientId ?? undefined);

  const totalInvoiced = (invoices ?? []).reduce((s, inv) => s + inv.totalCents, 0);
  const totalPayments = (payments ?? []).reduce((s, p) => s + p.amountCents, 0);
  const amountDue = totalInvoiced - totalPayments;

  return (
    <div className="space-y-6">
      {/* Project Overview */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Project Overview</h3>
        <div className="grid grid-cols-2 gap-px rounded border overflow-hidden bg-slate-100">
          {[
            { label: "Projected Revenue", value: formatCurrency(project.contractPrice) },
            { label: "Amount Due", value: formatCurrency(amountDue), red: amountDue > 0 },
            { label: "Invoiced", value: formatCurrency(totalInvoiced) },
            { label: "Payments", value: formatCurrency(totalPayments) },
            { label: "Contract Price", value: formatCurrency(project.contractPrice) },
            { label: "Total Cost", value: formatCurrency(project.totalCost) },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between bg-white px-4 py-2.5 text-sm">
              <span className="text-slate-500">{row.label}</span>
              <span className={`font-medium ${row.red ? "text-red-600" : "text-slate-800"}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Man Hours */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Job / Activity Overview</h3>
        <div className="grid grid-cols-2 gap-px rounded border overflow-hidden bg-slate-100">
          {[
            { label: "Budgeted Man Hours", value: project.laborHours != null ? `${project.laborHours} Hrs` : "—" },
            { label: "Actual Man Hours", value: "—" },
            { label: "Budgeted Labor Cost", value: formatCurrency(project.totalCost) },
            { label: "Actual Labor Cost", value: "—" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between bg-white px-4 py-2.5 text-sm">
              <span className="text-slate-500">{row.label}</span>
              <span className="font-medium text-slate-800">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── notes tab ─────────────────────────────────────────────────────────────────

function NotesTab({ project }: { project: Project }) {
  const { mutateAsync: update } = useUpdateProject();
  const [notes, setNotes] = useState(project.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await update({ id: project.id, notes });
      toast.success("Notes saved");
    } catch { toast.error("Failed to save notes"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <textarea
        className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
        rows={8}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add notes about this project…"
      />
      <Button size="sm" onClick={save} disabled={saving} className="h-8 text-xs">
        {saving ? "Saving…" : "Save Notes"}
      </Button>
    </div>
  );
}

// ── project detail dialog ─────────────────────────────────────────────────────

function ProjectDetailDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [editMode, setEditMode] = useState(false);

  const clientLabel = project.clientName ?? project.customerName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <DialogTitle className="text-lg font-bold text-slate-900">
                {project.name}
              </DialogTitle>
              <span className="text-slate-400">—</span>
              <button
                className="text-sm font-medium text-brand-600 hover:underline"
                onClick={() => setEditMode(true)}
              >
                Edit
              </button>
            </div>
            {clientLabel && (
              <p className="mt-0.5 text-sm text-slate-500">for {clientLabel}</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 font-medium">Progress:</span>
              <span className={`rounded px-3 py-1 text-sm font-bold text-white ${
                project.progressPct >= 100 ? "bg-green-500" : "bg-brand-500"
              }`}>
                {project.progressPct.toFixed(2)}%
              </span>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <FileText className="h-3.5 w-3.5" />
              View Invoice
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="milestone" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="shrink-0 border-b bg-slate-100 rounded-none justify-start px-4 py-0 h-10 gap-0">
            {[
              { value: "milestone", label: "Milestone" },
              { value: "billing", label: "Billing" },
              { value: "analysis", label: "Analysis" },
              { value: "notes", label: "Notes & Attachments" },
              { value: "audit", label: "Audit Trail" },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-full rounded-none border-b-2 border-transparent px-4 py-0 text-sm data-[state=active]:border-slate-700 data-[state=active]:bg-white data-[state=active]:shadow-none"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex-1 overflow-auto p-6">
            <TabsContent value="milestone" className="mt-0">
              <MilestoneTab project={project} />
            </TabsContent>
            <TabsContent value="billing" className="mt-0">
              <BillingTab project={project} />
            </TabsContent>
            <TabsContent value="analysis" className="mt-0">
              <AnalysisTab project={project} />
            </TabsContent>
            <TabsContent value="notes" className="mt-0">
              <NotesTab project={project} />
            </TabsContent>
            <TabsContent value="audit" className="mt-0">
              <div className="rounded-lg border bg-slate-50 p-6 text-center text-sm text-slate-400">
                Audit trail coming soon
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── new project dialog ────────────────────────────────────────────────────────

function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: clients } = useClients();
  const { mutateAsync: create, isPending } = useCreateProject();

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [address, setAddress] = useState("");
  const [contractPrice, setContractPrice] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState<ProjectStatus>("sold");

  function reset() {
    setName(""); setClientId(""); setAddress("");
    setContractPrice(""); setStatus("sold");
    setStartDate(new Date().toISOString().split("T")[0]);
  }

  async function submit() {
    if (!name) { toast.error("Project name is required"); return; }
    const selectedClient = (clients ?? []).find((c) => c.id === clientId);
    try {
      await create({
        name,
        customerName: selectedClient?.displayName ?? "",
        address: address || selectedClient?.billingAddress || "",
        city: selectedClient?.billingCity || "",
        state: selectedClient?.billingState || "",
        zip: selectedClient?.billingZip || "",
        status,
        startDate,
        endDate: null,
        laborHours: null,
        notes: null,
        contractPrice: Math.round(parseFloat(contractPrice || "0") * 100),
        clientId: clientId || null,
        budgetHours: null,
        laborRateCents: null,
        burdenedRateCents: null,
      });
      toast.success("Project created");
      reset();
      onOpenChange(false);
    } catch { toast.error("Failed to create project"); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Project Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Smith Retaining Wall" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
              <SelectContent>
                {(clients ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Contract Price ($)</Label>
            <Input
              type="number" step="0.01" min="0"
              value={contractPrice}
              onChange={(e) => setContractPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "Creating…" : "Create Project"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── main list ─────────────────────────────────────────────────────────────────

export function CRMProjectsList() {
  const { data: projects, isLoading } = useProjects(true);
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const filtered = (projects ?? []).filter((p) =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.clientName ?? p.customerName).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Projects</h1>
          <p className="text-sm text-slate-500">Manage all client projects, milestones, and billing</p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New Project
        </Button>
      </div>

      {/* Search */}
      <div className="border-b bg-white px-6 py-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-8 pl-9 text-sm"
            placeholder="Search projects or clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 min-w-[200px]">Project</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3 text-right">Contract Price</th>
              <th className="px-4 py-3">Start Date</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <BarChart3 className="h-8 w-8 text-slate-200" />
                    <p className="text-sm text-slate-400">
                      {search ? "No projects match your search" : "No projects yet — create your first"}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-b hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelectedProject(p)}
                >
                  <td className="px-4 py-3 font-medium text-brand-600">{p.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.clientName ?? p.customerName ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`capitalize border text-xs ${STATUS_COLOR[p.status]}`}>
                      {statusLabel(p.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <ProgressBar pct={p.progressPct} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">
                    {formatCurrency(p.contractPrice)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {p.startDate ? new Date(p.startDate + "T12:00:00").toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                      onClick={(e) => { e.stopPropagation(); setSelectedProject(p); }}
                      title="Open project"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedProject && (
        <ProjectDetailDialog
          project={selectedProject}
          open={!!selectedProject}
          onOpenChange={(o) => { if (!o) setSelectedProject(null); }}
        />
      )}
      <NewProjectDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
