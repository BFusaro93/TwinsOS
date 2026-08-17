"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStormEvents } from "@/lib/hooks/use-snow-dispatch";
import { useUninvoicedSnowVisits, useGenerateSnowInvoices } from "@/lib/hooks/use-snow-invoicing";
import { useSnowRateTiersForJobs, type SnowRateTier } from "@/lib/hooks/use-snow-rate-tiers";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "sonner";
import { Snowflake, FileText } from "lucide-react";
import type { CRMJobVisit } from "@/types/crm-jobs";

const INVOICE_TYPE_LABEL: Record<string, string> = {
  per_event: "Per Event",
  per_event_per_inch: "Per Event, Per Inch",
  per_push_per_inch: "Per Push",
  hourly: "Hourly",
};

// "per_event"/"per_event_per_inch" bill the whole STORM, not each dispatch
// within it — a job with 2 visits during one storm (e.g. morning + afternoon
// push) is one event, not two. Unlike "per_push_per_inch" (deliberately
// per-visit — that's the point of that option) and "hourly" (naturally
// per-visit), these two must be billed once per (job, storm event), or a
// multi-visit storm gets charged twice.
function isPerEventBilling(invoiceType: string): boolean {
  return invoiceType === "per_event" || invoiceType === "per_event_per_inch";
}

/** Group key for visits that must collapse to a single charge. Falls back to
 *  the visit's own id (i.e. no grouping) for per-visit billing types. */
function billingGroupKey(visit: CRMJobVisit): string {
  const invoiceType = visit.job?.invoiceType ?? "per_event";
  if (!isPerEventBilling(invoiceType)) return visit.id;
  return `${visit.jobId}::${visit.stormEventId ?? "none"}`;
}

/** Prices a storm's total depth against a job's configured tiers (e.g.
 *  0-3in flat $X, 3-6in flat $Y, ... 12+in $D/in) — the depth's tier is
 *  whichever one it falls within; the open-ended top tier (maxInches: null)
 *  bills ratePerInchCents × depth instead of a flat amount. */
function priceWithTiers(depth: number, tiers: SnowRateTier[]): number | null {
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.minInches - b.minInches);
  for (const tier of sorted) {
    const withinBounded = tier.maxInches != null && depth >= tier.minInches && depth < tier.maxInches;
    const withinOpenEnded = tier.maxInches == null && depth >= tier.minInches;
    if (withinBounded) return tier.rateCents ?? 0;
    if (withinOpenEnded) return Math.round((tier.ratePerInchCents ?? 0) * depth);
  }
  // Depth is below the first tier's minInches — no matching tier.
  return 0;
}

/** The group's total charge for one storm event — computed once per group,
 *  not once per visit. per_event_per_inch uses the storm's total depth (the
 *  MAX across the group's visits, since depth doesn't accumulate per push
 *  within one storm), not each visit's own depth. */
function computeGroupAmountCents(groupVisits: CRMJobVisit[], tiersByJobId?: Map<string, SnowRateTier[]>): number {
  const visit = groupVisits[0];
  const job = visit.job;
  const invoiceType = job?.invoiceType ?? "per_event";
  if (invoiceType === "per_event_per_inch") {
    const maxDepth = Math.max(...groupVisits.map((v) => v.snowDepthInches ?? 0));
    const tiers = job?.id ? tiersByJobId?.get(job.id) : undefined;
    const tiered = tiers?.length ? priceWithTiers(maxDepth, tiers) : null;
    return tiered ?? Math.round((job?.ratePerInchCents ?? 0) * maxDepth);
  }
  if (invoiceType === "per_push_per_inch") {
    return Math.round((job?.ratePerInchCents ?? 0) * (visit.snowDepthInches ?? 0));
  }
  if (invoiceType === "hourly") {
    return Math.round((visit.actualHours ?? 0) * (job?.rateCents ?? 0));
  }
  const serviceTotal = (job?.services ?? []).reduce((s, sv) => s + (sv.rateCents ?? 0) * (sv.qty ?? 1), 0);
  return visit.rateCents ?? job?.rateCents ?? serviceTotal;
}

function describeAmount(visit: CRMJobVisit, groupSize: number, tiersByJobId?: Map<string, SnowRateTier[]>): string {
  const invoiceType = visit.job?.invoiceType ?? "per_event";
  const splitSuffix = groupSize > 1 ? ` (split ÷${groupSize})` : "";
  if (invoiceType === "per_event_per_inch") {
    const tiers = visit.job?.id ? tiersByJobId?.get(visit.job.id) : undefined;
    if (tiers?.length) return `event max depth via rate tiers${splitSuffix}`;
    return `event max depth × ${formatCurrency(visit.job?.ratePerInchCents ?? 0)}/in${splitSuffix}`;
  }
  if (invoiceType === "per_push_per_inch") {
    return `${visit.snowDepthInches ?? 0}" × ${formatCurrency(visit.job?.ratePerInchCents ?? 0)}/in`;
  }
  if (invoiceType === "hourly") {
    return `${visit.actualHours ?? 0} hrs × ${formatCurrency(visit.job?.rateCents ?? 0)}/hr`;
  }
  return `${INVOICE_TYPE_LABEL[invoiceType] ?? "Per Event"}${splitSuffix}`;
}

export function SnowInvoicing() {
  const router = useRouter();
  const { data: events = [] } = useStormEvents();
  const [stormEventId, setStormEventId] = useState("");
  const { data: visits = [], isLoading, refetch } = useUninvoicedSnowVisits({
    stormEventId: stormEventId || undefined,
  });
  const generateInvoices = useGenerateSnowInvoices();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const perEventPerInchJobIds = useMemo(
    () => visits.filter((v) => v.job?.invoiceType === "per_event_per_inch" && v.job?.id).map((v) => v.job!.id),
    [visits]
  );
  const { data: tiersByJobId } = useSnowRateTiersForJobs(perEventPerInchJobIds);

  const rows = useMemo(() => {
    const byGroup = new Map<string, CRMJobVisit[]>();
    for (const v of visits) {
      const key = billingGroupKey(v);
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(v);
    }
    // Split each group's total evenly across its visits (one invoice line
    // item per visit either way, for idempotency-by-visit_id), assigning any
    // leftover cent(s) to the first visits in the group so the sum always
    // equals the group total exactly.
    const amountByVisitId = new Map<string, number>();
    for (const groupVisits of byGroup.values()) {
      const total = computeGroupAmountCents(groupVisits, tiersByJobId);
      const n = groupVisits.length;
      const base = Math.floor(total / n);
      let remainder = total - base * n;
      for (const v of groupVisits) {
        const extra = remainder > 0 ? 1 : 0;
        if (remainder > 0) remainder--;
        amountByVisitId.set(v.id, base + extra);
      }
    }
    return visits.map((v) => ({
      visit: v,
      amountCents: amountByVisitId.get(v.id) ?? 0,
      groupSize: byGroup.get(billingGroupKey(v))!.length,
    }));
  }, [visits, tiersByJobId]);

  const byClient = useMemo(() => {
    const groups = new Map<string, { clientName: string; rows: typeof rows }>();
    for (const row of rows) {
      const clientId = row.visit.clientId;
      if (!groups.has(clientId)) groups.set(clientId, { clientName: row.visit.clientName ?? "—", rows: [] });
      groups.get(clientId)!.rows.push(row);
    }
    return [...groups.entries()];
  }, [rows]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === rows.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(rows.map((r) => r.visit.id)));
  }

  const selectedTotal = rows.filter((r) => selectedIds.has(r.visit.id)).reduce((s, r) => s + r.amountCents, 0);

  async function handleGenerate() {
    const groups = byClient
      .map(([clientId, g]) => ({
        clientId,
        description: "Snow Service",
        visits: g.rows
          .filter((r) => selectedIds.has(r.visit.id))
          .map((r) => ({
            visitId: r.visit.id,
            jobId: r.visit.jobId,
            description: r.visit.job?.services?.[0]?.serviceName ?? r.visit.job?.invoiceDescription ?? "Snow Service",
            amountCents: r.amountCents,
            serviceDate: r.visit.scheduledDate,
          })),
      }))
      .filter((g) => g.visits.length > 0);

    if (groups.length === 0) { toast.error("No visits selected"); return; }

    try {
      const result = await generateInvoices.mutateAsync(groups);
      toast.success(
        `Generated ${result.invoicesCreated} invoice${result.invoicesCreated !== 1 ? "s" : ""}`,
        {
          action: {
            label: "View Invoices",
            onClick: () => router.push(`/crm/accounting/invoices?ids=${result.invoiceIds.join(",")}`),
          },
        }
      );
      setSelectedIds(new Set());
      void refetch();
    } catch {
      toast.error("Failed to generate invoices");
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Snow Invoicing" description="Storm-based invoice generation" />

      <div className="flex items-center gap-3 px-4 shrink-0">
        <Snowflake className="h-4 w-4 text-brand-500" />
        <Select value={stormEventId || "all"} onValueChange={(v) => setStormEventId(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-64 text-sm"><SelectValue placeholder="All storm events" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All storm events</SelectItem>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name} — {e.eventDate}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedIds.size > 0 && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-slate-600">
              {selectedIds.size} selected · <span className="font-semibold">{formatCurrency(selectedTotal)}</span>
            </span>
            <Button
              size="sm"
              className="h-9 text-xs gap-1.5 bg-brand-500 hover:bg-brand-600 text-white"
              onClick={handleGenerate}
              disabled={generateInvoices.isPending}
            >
              <FileText className="h-3.5 w-3.5" />
              {generateInvoices.isPending ? "Generating…" : "Generate Invoices"}
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto bg-white mx-4 rounded-lg border shadow-sm">
        {isLoading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-20 text-center text-sm text-slate-400">No completed snow visits are waiting to be invoiced.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 border-b">
              <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <th className="w-8 px-2 py-2.5">
                  <Checkbox checked={rows.length > 0 && selectedIds.size === rows.length} onCheckedChange={toggleAll} className="h-3.5 w-3.5" />
                </th>
                <th className="min-w-[140px] px-2 py-2.5">Client</th>
                <th className="px-2 py-2.5">Date</th>
                <th className="px-2 py-2.5">Service</th>
                <th className="px-2 py-2.5">Billing</th>
                <th className="px-2 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {byClient.map(([clientId, group]) => (
                <Fragment key={clientId}>
                  {group.rows.map(({ visit, amountCents, groupSize }) => (
                    <tr
                      key={visit.id}
                      className={cn("border-b border-slate-100 cursor-pointer", selectedIds.has(visit.id) ? "bg-brand-50" : "hover:bg-slate-50")}
                      onClick={() => toggle(visit.id)}
                    >
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(visit.id)} onCheckedChange={() => toggle(visit.id)} className="h-3.5 w-3.5" />
                      </td>
                      <td className="px-2 py-2">
                        <Link href={`/crm/clients/${clientId}`} className="font-medium text-brand-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                          {visit.clientName ?? "—"}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-slate-500">{visit.scheduledDate}</td>
                      <td className="px-2 py-2 text-slate-500">{visit.job?.services?.[0]?.serviceName ?? "Snow Service"}</td>
                      <td className="px-2 py-2 text-slate-500">{describeAmount(visit, groupSize, tiersByJobId)}</td>
                      <td className="px-2 py-2 text-right font-medium text-slate-700">{formatCurrency(amountCents)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 text-[10px] font-semibold text-slate-500">
                    <td colSpan={5} className="px-2 py-1 text-right">{group.clientName} subtotal</td>
                    <td className="px-2 py-1 text-right">
                      {formatCurrency(group.rows.reduce((s, r) => s + r.amountCents, 0))}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
