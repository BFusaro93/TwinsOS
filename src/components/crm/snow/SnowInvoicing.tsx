"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStormEvents } from "@/lib/hooks/use-snow-dispatch";
import { useUninvoicedSnowVisits, useGenerateSnowInvoices } from "@/lib/hooks/use-snow-invoicing";
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
  per_push_per_inch: "Per Push, Per Inch",
  hourly: "Hourly",
};

function computeAmountCents(visit: CRMJobVisit): number {
  const job = visit.job;
  const invoiceType = job?.invoiceType ?? "per_event";
  if (invoiceType === "per_event_per_inch" || invoiceType === "per_push_per_inch") {
    return Math.round((job?.ratePerInchCents ?? 0) * (visit.snowDepthInches ?? 0));
  }
  if (invoiceType === "hourly") {
    return Math.round((visit.actualHours ?? 0) * (job?.rateCents ?? 0));
  }
  const serviceTotal = (job?.services ?? []).reduce((s, sv) => s + (sv.rateCents ?? 0) * (sv.qty ?? 1), 0);
  return visit.rateCents ?? job?.rateCents ?? serviceTotal;
}

function describeAmount(visit: CRMJobVisit): string {
  const invoiceType = visit.job?.invoiceType ?? "per_event";
  if (invoiceType === "per_event_per_inch" || invoiceType === "per_push_per_inch") {
    return `${visit.snowDepthInches ?? 0}" × ${formatCurrency(visit.job?.ratePerInchCents ?? 0)}/in`;
  }
  if (invoiceType === "hourly") {
    return `${visit.actualHours ?? 0} hrs × ${formatCurrency(visit.job?.rateCents ?? 0)}/hr`;
  }
  return INVOICE_TYPE_LABEL[invoiceType] ?? "Per Event";
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

  const rows = useMemo(
    () => visits.map((v) => ({ visit: v, amountCents: computeAmountCents(v) })),
    [visits]
  );

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
            onClick: () => router.push("/crm/accounting/invoices"),
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
                  {group.rows.map(({ visit, amountCents }) => (
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
                      <td className="px-2 py-2 text-slate-500">{describeAmount(visit)}</td>
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
