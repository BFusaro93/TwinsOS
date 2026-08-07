"use client";

import { useMemo, useState } from "react";
import { Mail, X, Search, ChevronDown, RotateCcw, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailActivity {
  id: string;
  clientName: string;
  subject: string | null;
  sentTo: string | null;
  deliveredAt: string | null;
  occurredAt: string;
  createdByName: string | null;
  refTable: string | null;
  refId: string | null;
}

// ── Data hook ─────────────────────────────────────────────────────────────────

function useEmailActivity() {
  return useQuery({
    queryKey: ["crm-email-activity"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("client_activity")
        .select(`
          id,
          client_id,
          subject,
          sent_to,
          delivered_at,
          occurred_at,
          ref_table,
          ref_id,
          clients!inner(display_name),
          profiles(name)
        `)
        .eq("activity_type", "email")
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any): EmailActivity => ({
        id: row.id,
        clientName: row.clients?.display_name ?? "—",
        subject: row.subject,
        sentTo: row.sent_to,
        deliveredAt: row.delivered_at,
        occurredAt: row.occurred_at,
        createdByName: row.profiles?.name ?? null,
        refTable: row.ref_table ?? null,
        refId: row.ref_id ?? null,
      }));
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(val: string) {
  return new Date(val).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// ── Filter config ─────────────────────────────────────────────────────────────

type ColumnFilterKey = "date" | "subject" | "client" | "sent_to" | "resource";

const COLUMN_FILTERS: { key: ColumnFilterKey; label: string }[] = [
  { key: "date",     label: "Date Sent" },
  { key: "subject",  label: "Description" },
  { key: "client",   label: "Client" },
  { key: "sent_to",  label: "Sent To" },
  { key: "resource", label: "Resource" },
];

function fmtPct(num: number, den: number) {
  if (den === 0) return "—";
  return `${((num / den) * 100).toFixed(2)}%`;
}

type QuickFilter = "all" | "delivered" | "not_delivered";

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "all",           label: "All" },
  { key: "delivered",     label: "Delivered" },
  { key: "not_delivered", label: "Not Delivered" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function EmailActivityList() {
  const { data: emails = [] as EmailActivity[], isLoading, refetch } = useEmailActivity();
  const [search, setSearch] = useState("");
  const [activeColumnFilter, setActiveColumnFilter] = useState<ColumnFilterKey | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const total = emails.length;
  const deliveredCount = emails.filter((e: EmailActivity) => e.deliveredAt !== null).length;

  const counts: Record<QuickFilter, number> = useMemo(() => ({
    all:           total,
    delivered:     deliveredCount,
    not_delivered: total - deliveredCount,
  }), [total, deliveredCount]);

  const filtered = useMemo(() => {
    let list: EmailActivity[] = emails;

    // quick filter
    if (quickFilter === "delivered")     list = list.filter((e: EmailActivity) => e.deliveredAt !== null);
    if (quickFilter === "not_delivered") list = list.filter((e: EmailActivity) => e.deliveredAt === null);

    // column filter
    if (activeColumnFilter && filterValue.trim()) {
      const fv = filterValue.toLowerCase();
      list = list.filter((e: EmailActivity) => {
        switch (activeColumnFilter) {
          case "date":     return e.occurredAt.includes(fv);
          case "subject":  return (e.subject ?? "").toLowerCase().includes(fv);
          case "client":   return e.clientName.toLowerCase().includes(fv);
          case "sent_to":  return (e.sentTo ?? "").toLowerCase().includes(fv);
          case "resource": return (e.createdByName ?? "").toLowerCase().includes(fv);
          default:         return true;
        }
      });
    }

    // search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e: EmailActivity) =>
        (e.subject ?? "").toLowerCase().includes(q) ||
        e.clientName.toLowerCase().includes(q) ||
        (e.sentTo ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [emails, quickFilter, activeColumnFilter, filterValue, search]);

  const allSelected = filtered.length > 0 && filtered.every((e: EmailActivity) => selectedIds.has(e.id));
  const someSelected = selectedIds.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((e: EmailActivity) => e.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function resendSelected() {
    const selected = filtered.filter((e: EmailActivity) => selectedIds.has(e.id));
    const count = selected.length;
    if (count === 0) return;
    // Only invoice emails carry a resend path today — the invoice-email route
    // needs the actual crm_invoices.id (ref_id), not this log row's own id.
    // Campaign/general client emails have no ref_table/ref_id and no resend
    // endpoint at all, so they're skipped rather than silently mis-targeted.
    let sent = 0;
    let unsupported = 0;
    for (const email of selected) {
      if (!email.sentTo) continue;
      if (email.refTable !== "crm_invoices" || !email.refId) {
        unsupported++;
        continue;
      }
      try {
        await fetch("/api/crm/invoices/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: email.refId }),
        });
        sent++;
      } catch {
        // best-effort
      }
    }
    if (sent > 0) {
      toast.success(`Resent ${sent} email${sent > 1 ? "s" : ""}${unsupported > 0 ? ` — ${unsupported} skipped (not resendable)` : ""}`);
    } else if (unsupported > 0) {
      toast.error("Selected emails can't be resent — only invoice emails support resending today.");
    } else {
      toast.error("No emails could be resent");
    }
    setSelectedIds(new Set());
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4">
        <PageHeader title="Email Activity" description="All email communications sent to clients" />
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Page header */}
      <PageHeader
        title="Email Activity"
        description="All email communications sent to clients"
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Requests",  value: total.toLocaleString(),   color: "text-slate-900" },
          { label: "Delivered", value: fmtPct(deliveredCount, total), color: "text-green-600", sub: deliveredCount.toLocaleString() },
          { label: "Opened",    value: "—",                      color: "text-sky-600" },
          { label: "Bounced",   value: "—",                      color: "text-orange-500" },
          { label: "Spam",      value: "—",                      color: "text-red-500" },
          { label: "Rejected",  value: "—",                      color: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-4 shadow-sm text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
            {"sub" in s && s.sub && <p className="text-xs text-slate-400">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* White column filter bar */}
      <div className="flex items-center gap-1.5 border-b bg-white px-4 py-2">
        <span className="shrink-0 text-xs font-medium text-slate-500 mr-1">Select a Filter:</span>
        <div className="flex items-center gap-1 overflow-x-auto">
          {COLUMN_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                if (activeColumnFilter === key) { setActiveColumnFilter(null); setFilterValue(""); }
                else { setActiveColumnFilter(key); setFilterValue(""); }
              }}
              className={cn(
                "rounded px-2 py-0.5 text-xs transition-colors whitespace-nowrap",
                activeColumnFilter === key
                  ? "bg-brand-100 text-brand-700 font-medium"
                  : "hover:bg-slate-100 text-slate-600"
              )}
            >
              {label}
            </button>
          ))}
          {activeColumnFilter && (
            <>
              <Input
                autoFocus
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                placeholder={`Filter by ${COLUMN_FILTERS.find((f) => f.key === activeColumnFilter)?.label}…`}
                className="ml-2 h-6 w-48 text-xs"
              />
              <button
                onClick={() => { setActiveColumnFilter(null); setFilterValue(""); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dark actions bar */}
      <div className="flex items-center justify-between bg-[#4a4a4a] px-4 py-2">
        <div className="flex items-center gap-2">
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
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                disabled={!someSelected}
                onSelect={resendSelected}
              >
                <Send className="mr-2 h-3.5 w-3.5" />
                Resend Email
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
          <div className="ml-2 flex items-center gap-1 overflow-x-auto">
            {QUICK_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setQuickFilter(key)}
                className={cn(
                  "flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                  quickFilter === key
                    ? "bg-white text-slate-800"
                    : "text-slate-300 hover:text-white"
                )}
              >
                {label}
                {counts[key] > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    quickFilter === key
                      ? "bg-slate-200 text-slate-700"
                      : "bg-white/20 text-white"
                  )}>
                    {counts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search — after last filter tab */}
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
      {filtered.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No email activity"
          description="Emails sent to clients from invoices and automations will appear here."
        />
      ) : (
        <div className="flex-1 overflow-auto bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-slate-300"
                  />
                </TableHead>
                <TableHead className="whitespace-nowrap">Date Sent</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Sent To</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>Resource</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e: EmailActivity) => (
                <TableRow
                  key={e.id}
                  className={cn("hover:bg-slate-50", selectedIds.has(e.id) && "bg-brand-50")}
                  onClick={() => toggleOne(e.id)}
                >
                  <TableCell onClick={(ev) => ev.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggleOne(e.id)}
                      className="rounded border-slate-300"
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-slate-500">
                    {fmtDate(e.occurredAt)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-medium text-slate-800">
                    {e.subject ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{e.clientName}</TableCell>
                  <TableCell className="text-sm text-slate-500">{e.sentTo ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {e.deliveredAt ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {e.createdByName ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
