"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { EstimateStage } from "@/types/crm-estimates";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatPct(n: number, d: number) {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

// ── Stage colors (mirror EstimatesList) ───────────────────────────────────────

const STAGE_COLOR: Record<EstimateStage, string> = {
  draft:    "bg-slate-100 text-slate-600",
  quote:    "bg-blue-100 text-blue-700",
  sent:     "bg-violet-100 text-violet-700",
  approved: "bg-amber-100 text-amber-700",
  won:      "bg-green-100 text-green-700",
  lost:     "bg-red-100 text-red-700",
  invoiced: "bg-teal-100 text-teal-700",
};

const STAGE_LABEL: Record<EstimateStage, string> = {
  draft:    "Draft",
  quote:    "Quote",
  sent:     "Sent",
  approved: "Approved",
  won:      "Won",
  lost:     "Lost",
  invoiced: "Invoiced",
};

const ALL_STAGES: EstimateStage[] = ["draft", "quote", "sent", "approved", "won", "lost", "invoiced"];

// estimates.stage lost its DB CHECK constraint once stages became org-configurable
// (crm_estimate_stages) — a stage value can be anything, not just ALL_STAGES, so
// these read with a fallback instead of indexing the Record directly.
function stageColorClass(stage: string): string {
  return STAGE_COLOR[stage as EstimateStage] ?? "bg-slate-100 text-slate-600";
}
function stageLabelText(stage: string): string {
  return STAGE_LABEL[stage as EstimateStage] ?? stage;
}

// ── Date range ────────────────────────────────────────────────────────────────

type DateRange = "this_year" | "last_30" | "last_90" | "custom";

function getRangeStart(range: DateRange, customStart: string): string {
  const now = new Date();
  if (range === "this_year") return new Date(now.getFullYear(), 0, 1).toISOString();
  if (range === "last_30") return new Date(now.getTime() - 30 * 86400_000).toISOString();
  if (range === "last_90") return new Date(now.getTime() - 90 * 86400_000).toISOString();
  return customStart ? new Date(customStart).toISOString() : new Date(now.getFullYear(), 0, 1).toISOString();
}

// ── Raw DB types ──────────────────────────────────────────────────────────────

interface RawEstimate {
  id: string;
  estimate_number: string | null;
  // Not constrained to EstimateStage at the DB level anymore — orgs can define
  // their own stage keys via crm_estimate_stages.
  stage: string;
  total_price_cents: number;
  created_at: string;
  clients: { display_name: string } | null;
  description: string | null;
}

interface RawLineItem {
  id: string;
  estimate_id: string;
  service_name: string;
  status: string;
  qty: number;
  rate_cents: number;
  total_cents: number;
  direct_cost_cents: number;
  estimates: { stage: string; created_at: string } | null;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

function useEstimatesReportData(rangeStart: string) {
  return useQuery({
    queryKey: ["crm-estimates-report", rangeStart],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const [estRes, liRes] = await Promise.all([
        sb
          .from("estimates")
          .select("id, estimate_number, stage, total_price_cents:total_cents, created_at, description, clients(display_name)")
          .is("deleted_at", null)
          .gte("created_at", rangeStart),
        sb
          .from("estimate_line_items")
          .select("id, estimate_id, service_name, status, qty, rate_cents, total_cents, direct_cost_cents:total_cost_cents, estimates(stage, created_at)")
          .is("deleted_at", null),
      ]);

      const estimates: RawEstimate[] = estRes.data ?? [];
      const lineItems: RawLineItem[] = (liRes.data ?? []).filter(
        (li: RawLineItem) => li.estimates && li.estimates.created_at >= rangeStart
      );

      return { estimates, lineItems };
    },
  });
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SummaryRow({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="mb-4 flex flex-wrap gap-6 rounded-lg bg-slate-50 px-4 py-3">
      {items.map((item) => (
        <div key={item.label}>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{item.label}</p>
          <p className="text-sm font-bold text-slate-800">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400",
        right ? "text-right" : "text-left"
      )}
    >
      {children}
    </th>
  );
}

function TD({ children, right, muted }: { children: React.ReactNode; right?: boolean; muted?: boolean }) {
  return (
    <td
      className={cn(
        "px-3 py-2 text-sm",
        right ? "text-right" : "text-left",
        muted ? "text-slate-400" : "text-slate-700"
      )}
    >
      {children}
    </td>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-8 text-center text-sm text-slate-400">
        No data for selected period.
      </td>
    </tr>
  );
}

// ── Report 1: Estimates by Stage ──────────────────────────────────────────────

function ByStageReport({ estimates }: { estimates: RawEstimate[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const stage of ALL_STAGES) map.set(stage, { count: 0, total: 0 });
    for (const e of estimates) {
      if (!map.has(e.stage)) map.set(e.stage, { count: 0, total: 0 });
      const cur = map.get(e.stage)!;
      cur.count += 1;
      cur.total += e.total_price_cents ?? 0;
    }
    return Array.from(map.entries())
      .map(([stage, d]) => ({ stage, ...d }))
      .filter((r) => r.count > 0);
  }, [estimates]);

  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const totalValue = rows.reduce((s, r) => s + r.total, 0);

  return (
    <>
      <SummaryRow items={[
        { label: "Total Estimates", value: totalCount.toLocaleString() },
        { label: "Total Value", value: formatCurrency(totalValue) },
        { label: "Avg Value", value: totalCount ? formatCurrency(Math.round(totalValue / totalCount)) : "—" },
      ]} />
      <div className="overflow-auto rounded-lg border">
        <table className="w-full border-collapse">
          <thead className="border-b bg-slate-50">
            <tr>
              <TH>Stage</TH>
              <TH right>Count</TH>
              <TH right>Total Value</TH>
              <TH right>Avg Value</TH>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <EmptyRow cols={4} />
            ) : (
              rows.map((r) => (
                <tr key={r.stage} className="hover:bg-slate-50/50">
                  <TD>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", stageColorClass(r.stage))}>
                      {stageLabelText(r.stage)}
                    </span>
                  </TD>
                  <TD right>{r.count}</TD>
                  <TD right>{formatCurrency(r.total)}</TD>
                  <TD right>{formatCurrency(Math.round(r.total / r.count))}</TD>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Report 2: Won Estimates — Actual vs Estimated ─────────────────────────────

function WonEstimatesReport({ estimates }: { estimates: RawEstimate[] }) {
  const won = useMemo(
    () => estimates.filter((e) => e.stage === "won" || e.stage === "invoiced"),
    [estimates]
  );
  const totalValue = won.reduce((s, e) => s + (e.total_price_cents ?? 0), 0);

  return (
    <>
      <SummaryRow items={[
        { label: "Won Estimates", value: won.length.toLocaleString() },
        { label: "Total Estimated Value", value: formatCurrency(totalValue) },
      ]} />
      <p className="mb-3 text-xs text-slate-400">
        Job actuals coming in Sprint 5 — actual revenue column will be populated once jobs close.
      </p>
      <div className="overflow-auto rounded-lg border">
        <table className="w-full border-collapse">
          <thead className="border-b bg-slate-50">
            <tr>
              <TH>Estimate #</TH>
              <TH>Client</TH>
              <TH>Description</TH>
              <TH right>Estimated Total</TH>
              <TH right>Actual Revenue</TH>
              <TH>Stage</TH>
            </tr>
          </thead>
          <tbody className="divide-y">
            {won.length === 0 ? (
              <EmptyRow cols={6} />
            ) : (
              won.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/50">
                  <TD>{e.estimate_number ?? "—"}</TD>
                  <TD>{e.clients?.display_name ?? "—"}</TD>
                  <TD>{e.description ?? "—"}</TD>
                  <TD right>{formatCurrency(e.total_price_cents ?? 0)}</TD>
                  <TD right muted>—</TD>
                  <TD>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", stageColorClass(e.stage))}>
                      {stageLabelText(e.stage)}
                    </span>
                  </TD>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Report 3: Won Estimates by Service ────────────────────────────────────────

function WonByServiceReport({ lineItems }: { lineItems: RawLineItem[] }) {
  const rows = useMemo(() => {
    const wonItems = lineItems.filter(
      (li) =>
        li.status === "won" &&
        (li.estimates?.stage === "won" || li.estimates?.stage === "invoiced")
    );
    const map = new Map<string, { qty: number; revenue: number; estimateIds: Set<string> }>();
    for (const li of wonItems) {
      const key = li.service_name || "Unknown";
      if (!map.has(key)) map.set(key, { qty: 0, revenue: 0, estimateIds: new Set() });
      const cur = map.get(key)!;
      cur.qty += li.qty ?? 0;
      cur.revenue += li.total_cents ?? 0;
      cur.estimateIds.add(li.estimate_id);
    }
    return Array.from(map.entries())
      .map(([service, d]) => ({
        service,
        estimateCount: d.estimateIds.size,
        totalQty: d.qty,
        totalRevenue: d.revenue,
        avgRate: d.qty > 0 ? Math.round(d.revenue / d.qty) : 0,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [lineItems]);

  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);

  return (
    <>
      <SummaryRow items={[
        { label: "Services", value: rows.length.toLocaleString() },
        { label: "Total Revenue", value: formatCurrency(totalRevenue) },
      ]} />
      <div className="overflow-auto rounded-lg border">
        <table className="w-full border-collapse">
          <thead className="border-b bg-slate-50">
            <tr>
              <TH>Service</TH>
              <TH right># Estimates</TH>
              <TH right>Total Qty</TH>
              <TH right>Total Revenue</TH>
              <TH right>Avg Rate</TH>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <EmptyRow cols={5} />
            ) : (
              rows.map((r) => (
                <tr key={r.service} className="hover:bg-slate-50/50">
                  <TD>{r.service}</TD>
                  <TD right>{r.estimateCount}</TD>
                  <TD right>{r.totalQty.toLocaleString()}</TD>
                  <TD right>{formatCurrency(r.totalRevenue)}</TD>
                  <TD right>{formatCurrency(r.avgRate)}</TD>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Report 4: Won Line Items — Cost Breakdown ─────────────────────────────────

function WonServiceProductsReport({ lineItems }: { lineItems: RawLineItem[] }) {
  const wonItems = useMemo(
    () =>
      lineItems
        .filter(
          (li) =>
            li.status === "won" &&
            (li.estimates?.stage === "won" || li.estimates?.stage === "invoiced")
        )
        .sort((a, b) => (b.total_cents ?? 0) - (a.total_cents ?? 0)),
    [lineItems]
  );

  const totalRevenue = wonItems.reduce((s, li) => s + (li.total_cents ?? 0), 0);
  const totalCost = wonItems.reduce((s, li) => s + (li.direct_cost_cents ?? 0), 0);

  return (
    <>
      <SummaryRow items={[
        { label: "Line Items", value: wonItems.length.toLocaleString() },
        { label: "Total Revenue", value: formatCurrency(totalRevenue) },
        { label: "Total Est. Cost", value: formatCurrency(totalCost) },
        { label: "Overall Margin", value: formatPct(totalRevenue - totalCost, totalRevenue) },
      ]} />
      <div className="overflow-auto rounded-lg border">
        <table className="w-full border-collapse">
          <thead className="border-b bg-slate-50">
            <tr>
              <TH>Service</TH>
              <TH right>OCC</TH>
              <TH right>Qty</TH>
              <TH right>Rate</TH>
              <TH right>Total</TH>
              <TH right>Est. Cost</TH>
              <TH right>Est. Margin%</TH>
            </tr>
          </thead>
          <tbody className="divide-y">
            {wonItems.length === 0 ? (
              <EmptyRow cols={7} />
            ) : (
              wonItems.map((li) => {
                const margin = li.total_cents
                  ? ((li.total_cents - (li.direct_cost_cents ?? 0)) / li.total_cents) * 100
                  : 0;
                return (
                  <tr key={li.id} className="hover:bg-slate-50/50">
                    <TD>{li.service_name || "—"}</TD>
                    <TD right muted>—</TD>
                    <TD right>{li.qty ?? 0}</TD>
                    <TD right>{formatCurrency(li.rate_cents ?? 0)}</TD>
                    <TD right>{formatCurrency(li.total_cents ?? 0)}</TD>
                    <TD right>{formatCurrency(li.direct_cost_cents ?? 0)}</TD>
                    <TD right>
                      <span
                        className={cn(
                          "text-xs font-medium",
                          margin >= 40 ? "text-green-600" : margin >= 20 ? "text-amber-600" : "text-red-500"
                        )}
                      >
                        {Math.round(margin)}%
                      </span>
                    </TD>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Main exported section ─────────────────────────────────────────────────────

export function EstimatesReportSection() {
  const [dateRange, setDateRange] = useState<DateRange>("this_year");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const rangeStart = useMemo(() => getRangeStart(dateRange, customStart), [dateRange, customStart]);
  const rangeEnd = useMemo(
    () => (dateRange === "custom" && customEnd ? new Date(customEnd).toISOString() : new Date().toISOString()),
    [dateRange, customEnd]
  );

  const { data, isLoading } = useEstimatesReportData(rangeStart);

  const filteredEstimates = useMemo(() => {
    if (!data) return [];
    return data.estimates.filter((e) => e.created_at <= rangeEnd);
  }, [data, rangeEnd]);

  const filteredLineItems = useMemo(() => {
    if (!data) return [];
    return data.lineItems.filter(
      (li) => li.estimates && li.estimates.created_at >= rangeStart && li.estimates.created_at <= rangeEnd
    );
  }, [data, rangeStart, rangeEnd]);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Estimates</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_year">This Year</SelectItem>
              <SelectItem value="last_30">Last 30 Days</SelectItem>
              <SelectItem value="last_90">Last 90 Days</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {dateRange === "custom" && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 rounded-md border px-2 text-xs text-slate-700"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 rounded-md border px-2 text-xs text-slate-700"
              />
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      ) : (
        <Tabs defaultValue="by_stage">
          <TabsList className="mb-4">
            <TabsTrigger value="by_stage">By Stage</TabsTrigger>
            <TabsTrigger value="won_vs_actual">Won vs. Actual</TabsTrigger>
            <TabsTrigger value="won_by_service">Won by Service</TabsTrigger>
            <TabsTrigger value="service_products">Service Products</TabsTrigger>
          </TabsList>

          <TabsContent value="by_stage">
            <ByStageReport estimates={filteredEstimates} />
          </TabsContent>

          <TabsContent value="won_vs_actual">
            <WonEstimatesReport estimates={filteredEstimates} />
          </TabsContent>

          <TabsContent value="won_by_service">
            <WonByServiceReport lineItems={filteredLineItems} />
          </TabsContent>

          <TabsContent value="service_products">
            <WonServiceProductsReport lineItems={filteredLineItems} />
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
