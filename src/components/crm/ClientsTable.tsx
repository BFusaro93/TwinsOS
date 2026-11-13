"use client";

import { useState, useMemo, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import {
  useClientsPage,
  fetchFilteredClientIds,
  useBulkCancelClients,
  useBulkActivateClients,
  useBulkUpdateClients,
  previewOpenEstimatesLost,
  markOpenEstimatesLost,
  openEstimatesConfirmOptions,
} from "@/lib/hooks/use-clients";
import { useCancellationReasonOptions } from "@/lib/hooks/use-cancellation-reasons";
import { useClientFilterFields } from "@/lib/hooks/use-client-filter-fields";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useLoadMoreSentinel } from "@/lib/hooks/use-load-more-sentinel";
import { ClientFilterPopover } from "@/components/crm/shared/ClientFilterPopover";
import { parseMultiValue, type FilterRow } from "@/lib/client-filters";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/shared/SearchInput";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BulkTagDialog } from "@/components/crm/BulkTagDialog";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { ColumnSelector, type ColumnDef } from "@/components/crm/shared/ColumnSelector";
import { useColumnPrefs } from "@/lib/hooks/use-column-prefs";
import {
  Building2, Home, Maximize2, Tag, X, ChevronDown,
  Ban, CheckCircle, Pencil,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "@/components/shared/useConfirm";
import { previewClientVisits, cancelClientVisitsRemote, clientVisitsConfirmOptions } from "@/lib/client-visits-api";
import type { Client, ClientStatus, AccountType } from "@/types/crm";
import { ACCOUNT_TYPE_COLOR } from "@/lib/account-type-colors";

// ── Column visibility ─────────────────────────────────────────────────────────

const CLIENT_COLUMNS: ColumnDef[] = [
  { key: "tags",          label: "Tags" },
  { key: "type",          label: "Type" },
  { key: "status",        label: "Status" },
  { key: "phone",         label: "Phone" },
  { key: "email",         label: "Email" },
  // Key stays "city" so saved column prefs carry over; it shows the service address.
  { key: "city",          label: "Service Address" },
  { key: "zip",           label: "Zip" },
  { key: "balance",       label: "Balance" },
  { key: "source",        label: "Source" },
  { key: "clientSince",   label: "Client Since" },
  { key: "accountNumber", label: "Account #" },
];

// Default view = every column already shown today, plus Email.
const CLIENT_DEFAULT_VISIBLE: Record<string, boolean> = {
  tags: true, type: true, status: true, phone: true, email: true, city: true, balance: true,
  source: false, clientSince: false, accountNumber: false, zip: false,
};

const STATUS_COLOR: Record<string, string> = {
  active:    "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
  inactive:  "bg-muted text-muted-foreground",
  lead:      "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400",
  cancelled: "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",
  lost:      "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400",
};

// ── Cancel dialog ─────────────────────────────────────────────────────────────

function BulkCancelDialog({
  open, onOpenChange, count, onConfirm,
}: { open: boolean; onOpenChange: (o: boolean) => void; count: number; onConfirm: (reason: string) => Promise<void> }) {
  // Built-ins plus the org's own list (deduplicated); its "Other" entry asks for a typed reason.
  const allReasons = useCancellationReasonOptions().filter((r) => r !== "Other");
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
    } catch { toast.error("Failed to cancel clients"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Cancel {count} Client{count !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600 dark:text-neutral-400">
          Select a cancellation reason. This is required and drives cancellation reporting.
          Leads in the selection never became clients, so they are closed as Lost instead.
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Reason <span className="text-red-500 dark:text-red-400">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select reason…" /></SelectTrigger>
              <SelectContent>
                {allReasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                <SelectItem value="__custom__">Other (type below)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {reason === "__custom__" && (
            <Input
              placeholder="Describe reason…"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={saving}>
            {saving ? "Cancelling…" : `Cancel ${count} Client${count !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk Edit dialog ──────────────────────────────────────────────────────────

function BulkEditDialog({
  open, onOpenChange, count, onConfirm, canChangeStatus,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; count: number;
  onConfirm: (patch: Record<string, unknown>) => Promise<void>;
  /** Setting Inactive needs the activate/deactivate keys, same as Cancel. */
  canChangeStatus: boolean;
}) {
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const FIELDS = [
    // Only "inactive" here: cancel / lost / activate carry side effects (reason,
    // closed_at, client_since, automations, timeline) that a raw column write
    // skips — use the dedicated bulk Cancel / Activate / Close-as-lost actions.
    { key: "status",       label: "Status",       options: ["inactive"], hint: "Leads and lost leads in the selection are left as they are." },
    { key: "account_type", label: "Account Type", options: ["residential", "commercial"] },
    { key: "source",       label: "Source",       options: [] },
    { key: "priority",     label: "Priority",     options: ["low", "normal", "high"] },
    { key: "ok_to_email",  label: "OK to Email",  options: ["true", "false"] },
    // On only: clearing it in bulk would re-subscribe clients who unsubscribed
    // (the bulk route refuses it). Turn it off on a single client instead.
    { key: "do_not_market", label: "Do Not Market", options: ["true"], hint: "Can only be turned on in bulk. To turn it off, edit the client individually." },
  ].filter((f) => f.key !== "status" || canChangeStatus) as { key: string; label: string; options: string[]; hint?: string }[];

  const selected = FIELDS.find((f) => f.key === field);

  async function confirm() {
    if (!field || !value) { toast.error("Choose a field and value"); return; }
    setSaving(true);
    let parsedValue: unknown = value;
    if (field === "ok_to_email" || field === "do_not_market") parsedValue = value === "true";
    try {
      await onConfirm({ [field]: parsedValue });
      onOpenChange(false);
      setField(""); setValue("");
    } catch (err) { toast.error(err instanceof Error && err.message ? err.message : "Failed to update clients"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Bulk Edit — {count} Client{count !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600 dark:text-neutral-400">Choose one field to update across all selected clients.</p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Field</Label>
            <Select value={field} onValueChange={(v) => { setField(v); setValue(""); }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select field…" /></SelectTrigger>
              <SelectContent>
                {FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selected && (
            <div>
              <Label className="text-xs">New Value</Label>
              {selected.options.length > 0 ? (
                <Select value={value} onValueChange={setValue}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select value…" /></SelectTrigger>
                  <SelectContent>
                    {selected.options.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input className="mt-1" value={value} onChange={(e) => setValue(e.target.value)} placeholder={`New ${selected.label.toLowerCase()}…`} />
              )}
              {selected.hint && <p className="mt-1 text-xs text-muted-foreground">{selected.hint}</p>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={saving || !field || !value}>
            {saving ? "Updating…" : `Update ${count} Client${count !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main table ────────────────────────────────────────────────────────────────

interface Props {
  onSelect?: (client: Client) => void;
  /** Search + filter state is owned by the page so it survives switching to
   *  the list view and drives CSV export. */
  search: string;
  onSearchChange: (search: string) => void;
  filterRows: FilterRow[];
  onFilterRowsChange: Dispatch<SetStateAction<FilterRow[]>>;
}

export function ClientsTable({
  onSelect, search, onSearchChange: setSearch, filterRows, onFilterRowsChange: setFilterRows,
}: Props) {
  const { mutateAsync: bulkCancel } = useBulkCancelClients();
  const qc = useQueryClient();
  const [askConfirm, askConfirmDialog] = useConfirm();
  const { mutateAsync: bulkActivate, isPending: bulkActivating } = useBulkActivateClients();
  const { mutateAsync: bulkUpdate } = useBulkUpdateClients();
  const { can } = usePermissions();
  // client_allow_delete doubles as the gate for this app's closest
  // equivalent to deleting a client — activating/cancelling it — since
  // there's no actual delete action anywhere; client_activate_deactivate
  // grants the same thing under its own, more literal name.
  const canActivateDeactivate = can("client_allow_delete") || can("client_activate_deactivate");

  // Same filter fields (and the same server-side evaluation) as the list view.
  const { fields: FILTER_FIELDS } = useClientFilterFields();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);

  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const router = useRouter();

  const { visible: savedCols, toggle: toggleCol } = useColumnPrefs("crm-clients-table-columns", CLIENT_DEFAULT_VISIBLE);
  // Balances are behind View Client Balance, like the client page's Balance cards.
  const canViewBalance = can("client_view_balance");
  const columnDefs = canViewBalance ? CLIENT_COLUMNS : CLIENT_COLUMNS.filter((c) => c.key !== "balance");
  const cols = canViewBalance ? savedCols : { ...savedCols, balance: false };
  // +checkbox +name +actions
  const visibleColumnCount = 3 + columnDefs.filter((c) => cols[c.key] ?? true).length;

  function removeFilterRow(id: string) {
    setFilterRows((prev) => prev.filter((r) => r.id !== id));
  }

  const activeFilterCount = filterRows.filter((r) => r.value !== "").length;

  // Search, filters and paging all run server-side (crm_search_clients).
  const debouncedSearch = useDebouncedValue(search);
  // Filter text/number inputs update on every keystroke; debounce them like the search box.
  const debouncedFilters = useDebouncedValue(filterRows);
  const queryParams = useMemo(() => ({ search: debouncedSearch, filters: debouncedFilters }), [debouncedSearch, debouncedFilters]);

  // A selection belongs to the search + filters it was made under: once they
  // change, rows that are no longer shown must not stay selected (a "select all
  // 4,600 matching" then narrowed to 50 would otherwise act on the hidden 4,550).
  const [selectionParams, setSelectionParams] = useState(queryParams);
  if (selectionParams !== queryParams) {
    setSelectionParams(queryParams);
    setSelectedIds(new Set());
  }
  const { data, isPending: isLoading, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useClientsPage(queryParams);
  const filtered = useMemo(() => data?.pages.flatMap((p) => p.clients) ?? [], [data]);
  const total = data?.pages[0]?.total ?? filtered.length;
  const sentinelRef = useLoadMoreSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage });

  const allSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const someSelected = filtered.some((c) => selectedIds.has(c.id)) && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds((prev) => { const next = new Set(prev); filtered.forEach((c) => next.delete(c.id)); return next; });
    } else {
      setSelectedIds((prev) => { const next = new Set(prev); filtered.forEach((c) => next.add(c.id)); return next; });
    }
  }
  function toggleOne(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  const selectedCount = selectedIds.size;
  const selectedClientIds = Array.from(selectedIds);

  function clearSelection() { setSelectedIds(new Set()); }

  // The header checkbox covers the rows loaded so far; this extends the
  // selection to every client matching the current search + filters.
  const canSelectAllMatching = allSelected && total > filtered.length && selectedCount < total;
  async function selectAllMatching() {
    setSelectingAll(true);
    try {
      setSelectedIds(new Set(await fetchFilteredClientIds(queryParams)));
    } catch {
      toast.error("Couldn't select all matching clients");
    } finally {
      setSelectingAll(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput
          className="max-w-sm flex-1"
          inputClassName="h-8 text-sm"
          placeholder="Search clients…"
          value={search}
          onChange={setSearch}
        />

        <ClientFilterPopover fields={FILTER_FIELDS} rows={filterRows} onRowsChange={setFilterRows} />

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {filterRows.filter((r) => r.value).map((row) => {
              const fieldDef = FILTER_FIELDS.find((f) => f.value === row.field);
              const fieldLabel = fieldDef?.label ?? row.field;
              const opLabels: Record<string, string> = {
                eq: "=", neq: "≠", contains: "~", starts_with: "^",
                lt: "<", gt: ">", lte: "≤", gte: "≥",
              };
              const opLabel = opLabels[row.operator] ?? row.operator;
              const valLabel = fieldDef?.options
                ? parseMultiValue(row.value).map((v) => fieldDef.options!.find((o) => o.v === v)?.l ?? v).join(", ")
                : row.value;
              return (
                <Badge
                  key={row.id}
                  variant="secondary"
                  className="gap-1 pr-1 text-xs cursor-pointer"
                  onClick={() => removeFilterRow(row.id)}
                >
                  {fieldLabel} {opLabel} {valLabel}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              );
            })}
          </div>
        )}

        <ColumnSelector columns={columnDefs} visible={cols} onToggle={toggleCol} />

        {/* Bulk Actions */}
        {selectedCount > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 ml-auto">
                Actions ({selectedCount})
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs text-slate-400 dark:text-neutral-500 font-normal">{selectedCount} selected</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-muted/40 rounded" onClick={() => setBulkTagOpen(true)}>
                <Tag className="h-3.5 w-3.5 text-slate-400 dark:text-neutral-500" />
                Add / Remove Tags
              </button>
              {can("client_bulk_edit") && (
                <button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-muted/40 rounded" onClick={() => setBulkEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5 text-slate-400 dark:text-neutral-500" />
                  Bulk Edit Field
                </button>
              )}
              <DropdownMenuSeparator />
              {canActivateDeactivate && (
                <>
                  <button
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-muted/40 rounded text-green-700 dark:text-green-400 disabled:opacity-50 disabled:pointer-events-none"
                    disabled={bulkActivating}
                    onClick={async () => {
                      try {
                        const r = await bulkActivate(selectedClientIds);
                        toast.success(`${r.affected} client${r.affected !== 1 ? "s" : ""} activated`
                          + (r.skipped > 0 ? ` — ${r.skipped} lead${r.skipped !== 1 ? "s" : ""} skipped (converting a lead needs the Convert/Close permission)` : ""));
                        clearSelection();
                      } catch { toast.error("Failed to activate"); }
                    }}
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    {bulkActivating ? "Activating…" : "Activate Clients"}
                  </button>
                  <button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-muted/40 rounded text-red-600 dark:text-red-400" onClick={() => setBulkCancelOpen(true)}>
                    <Ban className="h-3.5 w-3.5" />
                    Cancel Clients
                  </button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="ml-auto text-sm text-slate-400 dark:text-neutral-500">
            {isLoading ? "…" : `${total.toLocaleString()} client${total !== 1 ? "s" : ""}`}
            {isFetching && !isLoading && !isFetchingNextPage && " · Updating…"}
          </span>
        )}
      </div>

      {canSelectAllMatching && (
        <div className="rounded-md border bg-muted/40 px-3 py-1.5 text-center text-xs text-slate-600 dark:text-neutral-400">
          All {filtered.length.toLocaleString()} loaded clients are selected.{" "}
          <button
            className="font-medium text-brand-600 dark:text-brand-400 underline disabled:opacity-50"
            disabled={selectingAll}
            onClick={selectAllMatching}
          >
            {selectingAll ? "Selecting…" : `Select all ${total.toLocaleString()} matching clients`}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 dark:bg-muted/40 z-10">
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
              <th className="px-3 py-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  className={cn(someSelected && "opacity-70")}
                />
              </th>
              <th className="px-4 py-3">Name</th>
              {cols.tags && <th className="px-4 py-3">Tags</th>}
              {cols.type && <th className="px-4 py-3">Type</th>}
              {cols.status && <th className="px-4 py-3">Status</th>}
              {cols.phone && <th className="px-4 py-3">Phone</th>}
              {cols.email && <th className="px-4 py-3">Email</th>}
              {cols.city && <th className="px-4 py-3">Service Address</th>}
              {cols.zip && <th className="px-4 py-3">Zip</th>}
              {cols.balance && <th className="px-4 py-3 text-right">Balance</th>}
              {cols.source && <th className="px-4 py-3">Source</th>}
              {cols.clientSince && <th className="px-4 py-3">Client Since</th>}
              {cols.accountNumber && <th className="px-4 py-3">Account #</th>}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: visibleColumnCount }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="py-16 text-center text-sm text-slate-400 dark:text-neutral-500">
                  {search || activeFilterCount > 0 ? "No clients match your filters" : "No clients yet"}
                </td>
              </tr>
            ) : (
              filtered.map((client) => {
                const isChecked = selectedIds.has(client.id);
                const tags = client.tags ?? [];
                return (
                  <tr
                    key={client.id}
                    className={cn("group cursor-pointer border-b hover:bg-slate-50 dark:hover:bg-muted/40", isChecked && "bg-brand-50 dark:bg-brand-900/30")}
                    onClick={() => onSelect?.(client)}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={isChecked} onCheckedChange={() => toggleOne(client.id)} aria-label={`Select ${client.displayName}`} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {client.accountType === "commercial"
                          ? <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-neutral-500" />
                          : <Home className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-neutral-500" />}
                        <span className="font-medium text-brand-600 dark:text-brand-400">{client.displayName}</span>
                        {client.doNotMarket && <span className="text-[9px] text-slate-400 dark:text-neutral-500 border rounded px-1">DNM</span>}
                      </div>
                    </td>
                    {cols.tags && (
                      <td className="px-4 py-2.5">
                        {tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {tags.map((tag) => (
                              <span key={tag} className="rounded-full px-1.5 py-0 text-[10px] font-medium bg-muted text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-slate-300 dark:text-neutral-500">—</span>}
                      </td>
                    )}
                    {cols.type && (
                      <td className="px-4 py-2.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", ACCOUNT_TYPE_COLOR[client.accountType] ?? "bg-muted text-muted-foreground")}>
                          {client.accountType}
                        </span>
                      </td>
                    )}
                    {cols.status && (
                      <td className="px-4 py-2.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_COLOR[client.status] ?? "bg-muted text-muted-foreground")}>
                          {client.status}
                        </span>
                      </td>
                    )}
                    {cols.phone && <td className="px-4 py-2.5 text-slate-600 dark:text-neutral-400">{client.primaryPhone ?? "—"}</td>}
                    {cols.email && <td className="px-4 py-2.5 text-slate-600 dark:text-neutral-400">{client.primaryEmail ?? "—"}</td>}
                    {cols.city && (
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {[client.serviceAddress, client.serviceCity, client.serviceState].filter(Boolean).join(", ") || "—"}
                      </td>
                    )}
                    {cols.zip && <td className="px-4 py-2.5 text-muted-foreground">{client.serviceZip || client.billingZip || "—"}</td>}
                    {cols.balance && (
                      <td className="px-4 py-2.5 text-right">
                        {client.balanceOutstandingCents > 0
                          ? <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(client.balanceOutstandingCents)}</span>
                          : <span className="text-slate-400 dark:text-neutral-500">—</span>}
                      </td>
                    )}
                    {cols.source && <td className="px-4 py-2.5 text-muted-foreground">{client.source ?? "—"}</td>}
                    {cols.clientSince && (
                      <td className="px-4 py-2.5 text-xs text-slate-400 dark:text-neutral-500">
                        {client.clientSince
                          ? new Date(client.clientSince + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "—"}
                      </td>
                    )}
                    {cols.accountNumber && <td className="px-4 py-2.5 text-muted-foreground">{client.accountNumber ?? "—"}</td>}
                    <td className="px-4 py-2.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/crm/clients/${client.id}`); }}
                        className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-slate-200 dark:hover:bg-neutral-700 transition-opacity"
                        title="Open full screen"
                      >
                        <Maximize2 className="h-3.5 w-3.5 text-slate-400 dark:text-neutral-500" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {hasNextPage && !isLoading && (
          <div ref={sentinelRef} className="flex justify-center p-3">
            <Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
              {isFetchingNextPage ? "Loading…" : `Load more (${(total - filtered.length).toLocaleString()} left)`}
            </Button>
          </div>
        )}
      </div>

      <BulkTagDialog
        open={bulkTagOpen}
        onOpenChange={(o) => { setBulkTagOpen(o); if (!o) clearSelection(); }}
        clientIds={selectedClientIds}
      />
      {askConfirmDialog}
      <BulkCancelDialog
        open={bulkCancelOpen}
        onOpenChange={setBulkCancelOpen}
        count={selectedCount}
        onConfirm={async (reason) => {
          // Ask about their upcoming visits and open estimates first, act once the clients are cancelled.
          let cancelVisits = false;
          try {
            const n = await previewClientVisits(selectedClientIds);
            if (n > 0) cancelVisits = await askConfirm(clientVisitsConfirmOptions(n));
          } catch { toast.warning("Couldn't check upcoming visits — they were left as they are."); }
          let markEstimates = false;
          if (can("estimate_edit")) {
            try {
              const m = await previewOpenEstimatesLost(selectedClientIds);
              if (m > 0) markEstimates = await askConfirm(openEstimatesConfirmOptions(m));
            } catch { toast.warning("Couldn't check open estimates — they were left as they are."); }
          }
          const result = await bulkCancel({ clientIds: selectedClientIds, reason });
          const skippedNote = result.skipped > 0
            ? ` — ${result.skipped} lead${result.skipped !== 1 ? "s" : ""} skipped (closing a lead needs the lead Close permission)`
            : "";
          if (markEstimates) {
            try {
              const marked = await markOpenEstimatesLost(selectedClientIds, reason);
              if (marked > 0) toast.success(`${marked} open estimate${marked !== 1 ? "s" : ""} marked lost`);
            } catch {
              toast.error("The open estimates couldn't be marked lost — change them from the Estimates page.");
            }
            await qc.invalidateQueries({ queryKey: ["estimates"] });
          }
          if (cancelVisits) {
            try {
              const done = await cancelClientVisitsRemote(selectedClientIds);
              toast.success(`${result.affected} account${result.affected !== 1 ? "s" : ""} closed — ${done} upcoming visit${done !== 1 ? "s" : ""} cancelled${skippedNote}`);
            } catch {
              toast.error("Clients cancelled, but their upcoming visits couldn't be cancelled — remove them from the dispatch board.");
            }
            await qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
          } else {
            toast.success(`${result.affected} account${result.affected !== 1 ? "s" : ""} closed${skippedNote}`);
          }
          clearSelection();
        }}
      />
      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={(o) => { setBulkEditOpen(o); if (!o) clearSelection(); }}
        count={selectedCount}
        canChangeStatus={canActivateDeactivate}
        onConfirm={async (patch) => {
          // Setting clients Inactive asks the same "Cancel their N upcoming visits?" question as Cancel.
          let cancelVisits = false;
          if (patch.status === "inactive") {
            try {
              const n = await previewClientVisits(selectedClientIds);
              if (n > 0) cancelVisits = await askConfirm(clientVisitsConfirmOptions(n));
            } catch { toast.warning("Couldn't check upcoming visits — they were left as they are."); }
          }
          const r = await bulkUpdate({ clientIds: selectedClientIds, patch });
          toast.success(`${r.affected} client${r.affected !== 1 ? "s" : ""} updated`);
          if (cancelVisits) {
            try {
              const done = await cancelClientVisitsRemote(selectedClientIds);
              toast.success(`${done} upcoming visit${done !== 1 ? "s" : ""} cancelled`);
            } catch {
              toast.error("Clients set Inactive, but their upcoming visits couldn't be cancelled — remove them from the dispatch board.");
            }
            await qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
          }
          clearSelection();
        }}
      />
    </div>
  );
}
