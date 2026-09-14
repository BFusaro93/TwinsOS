"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useLeads,
  useCreateLead,
  useConvertLeadToClient,
  useCloseLeadAsLost,
  useBulkCloseLeadsAsLost,
} from "@/lib/hooks/use-clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientFilterPopover } from "@/components/crm/shared/ClientFilterPopover";
import { matchesAllFilterRows, parseMultiValue, type FilterRow } from "@/lib/client-filters";
import { useLeadFilterFields } from "@/lib/hooks/use-lead-filter-fields";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import { Plus, UserCheck, Search, XCircle, Building2, Home, ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/types/crm";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useEstimates } from "@/lib/hooks/use-estimates";
import { ColumnSelector, type ColumnDef } from "@/components/crm/shared/ColumnSelector";
import { useColumnPrefs } from "@/lib/hooks/use-column-prefs";
import { ACCOUNT_TYPE_COLOR } from "@/lib/account-type-colors";
import { useClientSourceOptions } from "@/lib/hooks/use-client-sources";

/** "Date added" for the leads table: the lead-specific client_since date when
 *  set, else the row's created_at. Both are rendered in the browser's local
 *  timezone — a date-only string is pinned to noon so it can't roll back a day
 *  in negative-offset zones, and a timestamp is formatted as-is (never via
 *  toISOString().slice(0,10), which is UTC and reads as tomorrow after ~8 PM ET). */
function formatDateAdded(lead: Client): string {
  const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (lead.clientSince) return new Date(lead.clientSince + "T12:00:00").toLocaleDateString("en-US", fmt);
  if (lead.createdAt) {
    const d = new Date(lead.createdAt);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("en-US", fmt);
  }
  return "—";
}

// ── Column visibility ─────────────────────────────────────────────────────────

const LEAD_COLUMNS: ColumnDef[] = [
  { key: "type",        label: "Type" },
  { key: "phone",       label: "Phone" },
  { key: "email",       label: "Email" },
  { key: "city",        label: "City" },
  { key: "zip",         label: "Zip" },
  { key: "source",      label: "Source" },
  { key: "potential",   label: "Potential/yr" },
  { key: "dateAdded",   label: "Date Added" },
];

// Default view = every column already shown today.
const LEAD_DEFAULT_VISIBLE: Record<string, boolean> = {
  type: true, phone: true, email: true, city: true, source: true, potential: true, dateAdded: true,
  zip: false,
};

/** Sum of open (not accepted/lost) estimate totals for a lead. Shared by the table and list views. */
export function LeadRevenuePotential({ leadId, className, hideEmpty }: { leadId: string; className?: string; hideEmpty?: boolean }) {
  const { data: estimates } = useEstimates(leadId);
  const open = (estimates ?? []).filter((e) => e.stage !== "accepted" && e.stage !== "lost");
  const total = open.reduce((sum, e) => sum + e.totalCents, 0);
  if (total <= 0) return hideEmpty ? null : <span className="text-slate-300">—</span>;
  return <span className={cn("font-medium text-green-700", className)}>{formatCurrency(total)}</span>;
}

const CLOSE_REASONS = ["Price", "No response", "Went with competitor", "Not ready", "Out of service area", "Other"];

// ── New lead dialog ───────────────────────────────────────────────────────────

/** Exported so the Leads page can mount it once at page level — it has to open
 *  from the header button in BOTH the List and Table views, not just when
 *  LeadsList (the table) happens to be rendered. */
export function NewLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { mutateAsync: createLead, isPending } = useCreateLead();
  const router = useRouter();
  // Same org-level source list the Edit Client dialog uses (A-06).
  const { options: sourceOptions } = useClientSourceOptions();

  const [form, setForm] = useState({
    displayName: "", accountType: "residential", primaryPhone: "", primaryEmail: "", source: "",
  });

  function patch(k: keyof typeof form, v: string) { setForm((p) => ({ ...p, [k]: v })); }
  function reset() { setForm({ displayName: "", accountType: "residential", primaryPhone: "", primaryEmail: "", source: "" }); }

  async function submit() {
    if (!form.displayName.trim()) { toast.error("Name is required"); return; }
    try {
      const lead = await createLead({
        displayName: form.displayName.trim(),
        accountType: form.accountType,
        primaryPhone: form.primaryPhone,
        primaryEmail: form.primaryEmail,
        source: form.source,
      });
      toast.success("Lead created");
      reset();
      onOpenChange(false);
      router.push(`/crm/clients/${lead.id}`);
    } catch { toast.error("Failed to create lead"); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-500 -mt-1">Enter the basics — add address and jobs after saving.</p>
        <div className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-1.5">
            <Label>Name <span className="text-red-500">*</span></Label>
            <Input value={form.displayName} onChange={(e) => patch("displayName", e.target.value)} placeholder="Full name or company" autoFocus onKeyDown={(e) => e.key === "Enter" && void submit()} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Account Type</Label>
              <Select value={form.accountType} onValueChange={(v) => patch("accountType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="residential">Residential</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => patch("source", v)}>
                <SelectTrigger><SelectValue placeholder="How found?" /></SelectTrigger>
                <SelectContent>{sourceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <PhoneInput value={form.primaryPhone} onChange={(v) => patch("primaryPhone", v)} placeholder="(555) 000-0000" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.primaryEmail} onChange={(e) => patch("primaryEmail", e.target.value)} placeholder="name@email.com" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={isPending}>
            {isPending ? "Creating…" : "Save & Add Details →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Convert dialog ────────────────────────────────────────────────────────────

function ConvertDialog({ lead, open, onOpenChange }: { lead: Client; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { mutateAsync: convert, isPending } = useConvertLeadToClient();

  async function confirm() {
    try {
      await convert(lead.id);
      toast.success(`${lead.displayName} converted to client`);
      onOpenChange(false);
      router.push(`/crm/clients/${lead.id}`);
    } catch { toast.error("Failed to convert"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Convert to Client</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">
          Convert <span className="font-medium">{lead.displayName}</span> to an active client?
          They will appear in the Clients list and can be scheduled for jobs and invoiced.
        </p>
        {lead.revenuePotentialCents > 0 && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
            Revenue potential: <strong>{formatCurrency(lead.revenuePotentialCents)}/yr</strong>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void confirm()} disabled={isPending}>
            <UserCheck className="mr-1.5 h-4 w-4" />
            {isPending ? "Converting…" : "Convert to Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Close lead dialog ─────────────────────────────────────────────────────────

function CloseLeadDialog({ lead, open, onOpenChange }: { lead: Client; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { mutateAsync: close, isPending } = useCloseLeadAsLost();
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");

  async function confirm() {
    const finalReason = reason === "__custom__" ? custom.trim() : reason;
    if (!finalReason) { toast.error("Select a reason"); return; }
    try {
      await close({ clientId: lead.id, reason: finalReason });
      toast.success(`${lead.displayName} closed as lost`);
      onOpenChange(false);
    } catch { toast.error("Failed to close lead"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Close Lead — Lost</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">Mark <span className="font-medium">{lead.displayName}</span> as lost. They&rsquo;ll be marked &ldquo;Lost&rdquo; and no longer appear in the active leads list.</p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Reason <span className="text-red-500">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Why are they lost?" /></SelectTrigger>
              <SelectContent>
                {CLOSE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                <SelectItem value="__custom__">Other…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {reason === "__custom__" && (
            <Input placeholder="Describe reason…" value={custom} onChange={(e) => setCustom(e.target.value)} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={isPending}>
            {isPending ? "Closing…" : "Close as Lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk close dialog ─────────────────────────────────────────────────────────

function BulkCloseLeadDialog({
  count, open, onOpenChange, onConfirm,
}: { count: number; open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirm() {
    const finalReason = reason === "__custom__" ? custom.trim() : reason;
    if (!finalReason) { toast.error("Select a reason"); return; }
    setSaving(true);
    try {
      await onConfirm(finalReason);
      onOpenChange(false);
      setReason(""); setCustom("");
    } catch { toast.error("Failed to close leads"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Close {count} Lead{count !== 1 ? "s" : ""} — Lost</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">
          Mark {count} lead{count !== 1 ? "s" : ""} as lost. They&rsquo;ll be marked &ldquo;Lost&rdquo; and no longer appear in the active leads list.
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Reason <span className="text-red-500">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Why are they lost?" /></SelectTrigger>
              <SelectContent>
                {CLOSE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                <SelectItem value="__custom__">Other…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {reason === "__custom__" && (
            <Input placeholder="Describe reason…" value={custom} onChange={(e) => setCustom(e.target.value)} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={saving}>
            {saving ? "Closing…" : `Close ${count} Lead${count !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main list ─────────────────────────────────────────────────────────────────

interface LeadsListProps {
  newDialogOpen?: boolean;
  onNewDialogOpenChange?: (o: boolean) => void;
  onSelect?: (lead: Client) => void;
}

export function LeadsList({ newDialogOpen, onNewDialogOpenChange, onSelect }: LeadsListProps = {}) {
  const { data: leads, isLoading } = useLeads();
  const { mutateAsync: bulkClose } = useBulkCloseLeadsAsLost();
  const { can } = usePermissions();
  // lead_allow_delete doubles as the gate for this app's closest equivalent
  // to deleting a lead — closing it as lost — since there's no actual
  // delete action anywhere for leads (same reasoning as client_allow_delete
  // on ClientsTable.tsx).
  const canCloseLead = can("lead_allow_delete");
  const canConvertLead = can("lead_convert_close");
  const { fields: FILTER_FIELDS } = useLeadFilterFields();
  const [search, setSearch] = useState("");
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const [convertLead, setConvertLead] = useState<Client | undefined>();
  const [closeLead, setCloseLead] = useState<Client | undefined>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [bulkCloseOpen, setBulkCloseOpen] = useState(false);

  const { visible: cols, toggle: toggleCol } = useColumnPrefs("crm-leads-table-columns", LEAD_DEFAULT_VISIBLE);
  // +checkbox +name +actions
  const visibleColumnCount = 3 + LEAD_COLUMNS.filter((c) => cols[c.key] ?? true).length;

  const controlled = newDialogOpen !== undefined;
  const dialogOpen = controlled ? newDialogOpen : internalDialogOpen;
  function setDialogOpen(o: boolean) {
    if (controlled) onNewDialogOpenChange?.(o);
    else setInternalDialogOpen(o);
  }

  const filtered = (leads ?? []).filter((l) => {
    const q = search.toLowerCase();
    if (q && !(
      l.displayName.toLowerCase().includes(q) ||
      (l.primaryPhone ?? "").includes(search) ||
      (l.primaryEmail ?? "").toLowerCase().includes(q) ||
      (l.billingCity ?? "").toLowerCase().includes(q)
    )) return false;
    return matchesAllFilterRows(l, filterRows);
  });

  const activeFilterCount = filterRows.filter((r) => r.value !== "").length;

  const allSelected = filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id));
  const someSelected = filtered.some((l) => selectedIds.has(l.id)) && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds((prev) => { const next = new Set(prev); filtered.forEach((l) => next.delete(l.id)); return next; });
    } else {
      setSelectedIds((prev) => { const next = new Set(prev); filtered.forEach((l) => next.add(l.id)); return next; });
    }
  }
  function toggleOne(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function clearSelection() { setSelectedIds(new Set()); }

  const selectedCount = selectedIds.size;
  const selectedLeadIds = Array.from(selectedIds);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search leads…" className="h-8 pl-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <ClientFilterPopover fields={FILTER_FIELDS} rows={filterRows} onRowsChange={setFilterRows} />

        <ColumnSelector columns={LEAD_COLUMNS} visible={cols} onToggle={toggleCol} />

        {selectedCount > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 ml-auto">
                Actions ({selectedCount})
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs text-slate-400 font-normal">{selectedCount} selected</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {canCloseLead && (
                <button
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50 rounded text-red-600"
                  onClick={() => setBulkCloseOpen(true)}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Close as Lost
                </button>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="ml-auto text-sm text-slate-500">
            {isLoading ? "…" : `${filtered.length} lead${filtered.length !== 1 ? "s" : ""}`}
          </span>
        )}

        {!controlled && (
          <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Lead
          </Button>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1 -mt-1.5">
          {filterRows.filter((r) => r.value).map((row) => {
            const fieldDef = FILTER_FIELDS.find((f) => f.value === row.field);
            const fieldLabel = fieldDef?.label ?? row.field;
            const opLabels: Record<string, string> = { eq: "=", neq: "≠", contains: "~", starts_with: "^", lt: "<", gt: ">", lte: "≤", gte: "≥" };
            const opLabel = opLabels[row.operator] ?? row.operator;
            const valLabel = fieldDef?.options
              ? parseMultiValue(row.value).map((v) => fieldDef.options!.find((o) => o.v === v)?.l ?? v).join(", ")
              : row.value;
            return (
              <Badge
                key={row.id}
                variant="secondary"
                className="gap-1 pr-1 text-xs cursor-pointer"
                onClick={() => setFilterRows((prev) => prev.filter((r) => r.id !== row.id))}
              >
                {fieldLabel} {opLabel} {valLabel}<X className="h-2.5 w-2.5" />
              </Badge>
            );
          })}
          <button onClick={() => setFilterRows([])} className="text-xs text-slate-400 hover:text-slate-600 underline">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-3 py-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  className={cn(someSelected && "opacity-70")}
                />
              </th>
              <th className="min-w-[180px] px-4 py-3">Name</th>
              {cols.type && <th className="px-4 py-3">Type</th>}
              {cols.phone && <th className="px-4 py-3">Phone</th>}
              {cols.email && <th className="px-4 py-3">Email</th>}
              {cols.city && <th className="px-4 py-3">City</th>}
              {cols.zip && <th className="px-4 py-3">Zip</th>}
              {cols.source && <th className="px-4 py-3">Source</th>}
              {cols.potential && <th className="px-4 py-3 text-right">Potential/yr</th>}
              {cols.dateAdded && <th className="px-4 py-3">Date Added</th>}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: visibleColumnCount }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="py-16 text-center text-sm text-slate-400">
                  {search || activeFilterCount > 0 ? "No leads match your filters" : "No leads yet — add your first lead"}
                </td>
              </tr>
            ) : (
              filtered.map((lead) => {
                const isChecked = selectedIds.has(lead.id);
                return (
                  <tr
                    key={lead.id}
                    className={cn("group border-b hover:bg-slate-50", onSelect && "cursor-pointer", isChecked && "bg-brand-50")}
                    onClick={() => onSelect?.(lead)}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={isChecked} onCheckedChange={() => toggleOne(lead.id)} aria-label={`Select ${lead.displayName}`} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {lead.accountType === "commercial"
                          ? <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          : <Home className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                        <button
                          className="font-medium text-brand-600 hover:underline text-left"
                          onClick={(e) => { e.stopPropagation(); onSelect?.(lead); }}
                        >
                          {lead.displayName}
                        </button>
                      </div>
                    </td>
                    {cols.type && (
                      <td className="px-4 py-2.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", ACCOUNT_TYPE_COLOR[lead.accountType] ?? "bg-slate-100 text-slate-500")}>
                          {lead.accountType}
                        </span>
                      </td>
                    )}
                    {cols.phone && <td className="px-4 py-2.5 text-slate-600">{lead.primaryPhone ?? "—"}</td>}
                    {cols.email && <td className="px-4 py-2.5 text-slate-600">{lead.primaryEmail ?? "—"}</td>}
                    {cols.city && (
                      <td className="px-4 py-2.5 text-slate-500">
                        {[lead.serviceAddress, lead.serviceCity, lead.serviceState].filter(Boolean).join(", ") || "—"}
                      </td>
                    )}
                    {cols.zip && (
                      <td className="px-4 py-2.5 text-slate-500">
                        {lead.serviceZip || lead.billingZip || "—"}
                      </td>
                    )}
                    {cols.source && <td className="px-4 py-2.5 text-slate-500">{lead.source ?? "—"}</td>}
                    {cols.potential && (
                      <td className="px-4 py-2.5 text-right">
                        <LeadRevenuePotential leadId={lead.id} />
                      </td>
                    )}
                    {cols.dateAdded && (
                      <td className="px-4 py-2.5 text-xs text-slate-400">
                        {formatDateAdded(lead)}
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        {canConvertLead && (
                          <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); setConvertLead(lead); }}>
                            <UserCheck className="h-3 w-3" /> Convert
                          </Button>
                        )}
                        {canCloseLead && (
                          <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px] text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); setCloseLead(lead); }}>
                            <XCircle className="h-3 w-3" /> Close
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <NewLeadDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      {convertLead && <ConvertDialog lead={convertLead} open={!!convertLead} onOpenChange={(o) => { if (!o) setConvertLead(undefined); }} />}
      {closeLead && <CloseLeadDialog lead={closeLead} open={!!closeLead} onOpenChange={(o) => { if (!o) setCloseLead(undefined); }} />}
      <BulkCloseLeadDialog
        count={selectedCount}
        open={bulkCloseOpen}
        onOpenChange={(o) => { setBulkCloseOpen(o); if (!o) clearSelection(); }}
        onConfirm={async (reason) => {
          await bulkClose({ clientIds: selectedLeadIds, reason });
          toast.success(`${selectedCount} lead${selectedCount !== 1 ? "s" : ""} closed as lost`);
          clearSelection();
        }}
      />
    </div>
  );
}
