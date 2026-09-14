"use client";

import { useMemo, useState } from "react";
import { MessageSquare, X, Search, RotateCcw, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SmsActivity {
  id: string;
  clientName: string;
  body: string | null;
  sentTo: string | null;
  direction: "inbound" | "outbound";
  status: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  occurredAt: string;
}

// ── Data hook ─────────────────────────────────────────────────────────────────

function useSmsActivity() {
  return useQuery({
    queryKey: ["crm-sms-activity"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("client_activity")
        .select(`
          id,
          client_id,
          body,
          sent_to,
          direction,
          status,
          delivered_at,
          failed_at,
          occurred_at,
          clients!inner(display_name)
        `)
        .eq("activity_type", "sms")
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any): SmsActivity => ({
        id: row.id,
        clientName: row.clients?.display_name ?? "—",
        body: row.body,
        sentTo: row.sent_to,
        direction: row.direction === "inbound" ? "inbound" : "outbound",
        status: row.status,
        deliveredAt: row.delivered_at,
        failedAt: row.failed_at,
        occurredAt: row.occurred_at,
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

function fmtPct(num: number, den: number) {
  if (den === 0) return "—";
  return `${((num / den) * 100).toFixed(2)}%`;
}

type QuickFilter = "all" | "delivered" | "failed" | "received";

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "delivered", label: "Delivered" },
  { key: "failed",    label: "Failed" },
  { key: "received",  label: "Received" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function SmsActivityList() {
  const { data: texts = [] as SmsActivity[], isLoading, refetch } = useSmsActivity();
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");

  const outbound = useMemo(() => texts.filter((t: SmsActivity) => t.direction === "outbound"), [texts]);
  const total = outbound.length;
  const deliveredCount = outbound.filter((t: SmsActivity) => t.deliveredAt !== null).length;
  const failedCount = outbound.filter((t: SmsActivity) => t.failedAt !== null).length;
  const receivedCount = texts.filter((t: SmsActivity) => t.direction === "inbound").length;

  const counts: Record<QuickFilter, number> = useMemo(() => ({
    all:       texts.length,
    delivered: deliveredCount,
    failed:    failedCount,
    received:  receivedCount,
  }), [texts.length, deliveredCount, failedCount, receivedCount]);

  const filtered = useMemo(() => {
    let list: SmsActivity[] = texts;

    if (quickFilter === "delivered") list = list.filter((t) => t.direction === "outbound" && t.deliveredAt !== null);
    if (quickFilter === "failed")    list = list.filter((t) => t.direction === "outbound" && t.failedAt !== null);
    if (quickFilter === "received")  list = list.filter((t) => t.direction === "inbound");

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        (t.body ?? "").toLowerCase().includes(q) ||
        t.clientName.toLowerCase().includes(q) ||
        (t.sentTo ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [texts, quickFilter, search]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Sent",      value: total.toLocaleString(),               color: "text-slate-900" },
          { label: "Delivered", value: fmtPct(deliveredCount, total),        color: "text-green-600", sub: deliveredCount.toLocaleString() },
          { label: "Failed",    value: fmtPct(failedCount, total),           color: "text-red-600",   sub: failedCount.toLocaleString() },
          { label: "Received",  value: receivedCount.toLocaleString(),       color: "text-sky-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-4 shadow-sm text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
            {"sub" in s && s.sub && <p className="text-xs text-slate-400">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Dark actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 bg-[#4a4a4a] px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 gap-y-1">
          <button
            onClick={() => refetch()}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#6a6a6a] bg-[#5a5a5a] text-white hover:bg-[#6a6a6a]"
            title="Refresh"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <div className="ml-2 flex min-w-0 items-center gap-1 overflow-x-auto">
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

          <div className="relative ml-2">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-7 w-44 pl-7 text-xs bg-white border-slate-200 focus-visible:ring-0"
            />
          </div>
          {search && (
            <button onClick={() => setSearch("")} className="text-slate-300 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No text activity"
          description="Texts sent to clients from automations, and any replies they send back, will appear here."
        />
      ) : (
        <div className="flex-1 overflow-auto bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-10"></TableHead>
                <TableHead className="whitespace-nowrap">Date</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} className="hover:bg-slate-50">
                  <TableCell>
                    {t.direction === "inbound" ? (
                      <ArrowDownLeft className="h-3.5 w-3.5 text-sky-500" aria-label="Received" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" aria-label="Sent" />
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-slate-500">
                    {fmtDate(t.occurredAt)}
                  </TableCell>
                  <TableCell className="max-w-sm truncate text-slate-800">
                    {t.body ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{t.clientName}</TableCell>
                  <TableCell className="text-sm text-slate-500">{t.sentTo ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {t.direction === "inbound" ? (
                      <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
                        Received
                      </span>
                    ) : t.deliveredAt ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
                        Delivered
                      </span>
                    ) : t.failedAt ? (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                        Failed
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        {t.status ?? "Sent"}
                      </span>
                    )}
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
