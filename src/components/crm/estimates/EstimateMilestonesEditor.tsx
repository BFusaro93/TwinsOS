"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Receipt, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useEstimateMilestones,
  useCreateEstimateMilestone,
  useUpdateEstimateMilestone,
  useDeleteEstimateMilestone,
  useCreateInvoiceFromMilestone,
} from "@/lib/hooks/use-estimate-milestones";
import type { EstimateMilestone } from "@/types/crm-estimates";

function amountFor(type: "flat" | "percent", value: number, totalCents: number): number {
  return type === "percent" ? Math.round((totalCents * value) / 10000) : value;
}

function MilestoneRow({
  milestone,
  totalCents,
  overAllocated,
  clientId,
  salesRepId,
  estimateId,
}: {
  milestone: EstimateMilestone;
  totalCents: number;
  /** Milestones collectively total more than the estimate — block invoicing
   *  until amounts are corrected, so an over-allocation can't turn into a
   *  real invoice that overbills the client past the estimate's total. */
  overAllocated: boolean;
  clientId: string;
  salesRepId: string | null;
  estimateId: string;
}) {
  const router = useRouter();
  const update = useUpdateEstimateMilestone();
  const del = useDeleteEstimateMilestone();
  const { mutateAsync: createInvoice, isPending: creatingInvoice } = useCreateInvoiceFromMilestone();
  const [name, setName] = useState(milestone.name);
  const [type, setType] = useState(milestone.milestoneType);
  // Percent is stored as basis points (1% = 100bps), flat as cents — both are
  // "the raw dollar/percent value the user typed, times 100", so displaying
  // and re-parsing the input field uses the same /100 and *100 either way.
  const [valueStr, setValueStr] = useState(String(milestone.milestoneValue / 100));

  const locked = milestone.status === "invoiced";

  function toMilestoneValue(raw: string): number {
    return Math.round((parseFloat(raw) || 0) * 100);
  }

  function commit(nextType: "flat" | "percent", nextValueStr: string) {
    const milestoneValue = toMilestoneValue(nextValueStr);
    const amountCents = amountFor(nextType, milestoneValue, totalCents);
    update.mutate({
      id: milestone.id,
      estimateId,
      patch: { milestoneType: nextType, milestoneValue, amountCents },
    });
  }

  const amountCents = amountFor(type, toMilestoneValue(valueStr), totalCents);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => { if (name !== milestone.name) update.mutate({ id: milestone.id, estimateId, patch: { name } }); }}
        disabled={locked}
        className="h-8 flex-1 text-sm"
        placeholder="e.g. Deposit"
      />
      <Select
        value={type}
        onValueChange={(v) => { const t = v as "flat" | "percent"; setType(t); commit(t, valueStr); }}
        disabled={locked}
      >
        <SelectTrigger className="h-8 w-20 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="percent">%</SelectItem>
          <SelectItem value="flat">$</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="number"
        min={0}
        value={valueStr}
        onChange={(e) => setValueStr(e.target.value)}
        onBlur={() => commit(type, valueStr)}
        disabled={locked}
        className="h-8 w-24 text-sm"
      />
      <span className="w-24 shrink-0 text-right text-sm font-medium text-slate-700">
        {formatCurrency(amountCents)}
      </span>
      {locked ? (
        <>
          <Badge variant="outline" className="shrink-0 border-teal-200 bg-teal-50 text-[10px] text-teal-700">
            Invoiced
          </Badge>
          {milestone.invoiceId && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-slate-400 hover:text-slate-700"
              onClick={() => router.push(`/crm/accounting/invoices/${milestone.invoiceId}`)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      ) : (
        <>
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1 text-xs"
            disabled={creatingInvoice || amountCents <= 0 || overAllocated}
            title={overAllocated ? "Milestones total more than the estimate — fix amounts before invoicing" : undefined}
            onClick={async () => {
              try {
                const invoice = await createInvoice({
                  milestone: { ...milestone, name, amountCents },
                  estimateId,
                  clientId,
                  salesRepId,
                });
                toast.success("Invoice created");
                router.push(`/crm/accounting/invoices/${invoice.id}`);
              } catch {
                toast.error("Failed to create invoice");
              }
            }}
          >
            <Receipt className="h-3.5 w-3.5 text-teal-500" />
            {creatingInvoice ? "Creating…" : "Invoice"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-500"
            onClick={() => del.mutate({ id: milestone.id, estimateId })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

export function EstimateMilestonesEditor({
  estimateId,
  clientId,
  salesRepId,
  totalCents,
}: {
  estimateId: string;
  clientId: string;
  salesRepId: string | null;
  totalCents: number;
}) {
  const { data: milestones = [], isLoading } = useEstimateMilestones(estimateId);
  const create = useCreateEstimateMilestone();

  const totalAllocatedCents = milestones.reduce((s, m) => s + m.amountCents, 0);
  const diffCents = totalCents - totalAllocatedCents;
  const overAllocated = diffCents < 0;

  function handleAdd() {
    create.mutate({
      estimateId,
      name: `Milestone ${milestones.length + 1}`,
      milestoneType: "percent",
      milestoneValue: 0,
      amountCents: 0,
      sortOrder: milestones.length,
    });
  }

  if (isLoading) return <p className="text-xs text-slate-400">Loading milestones…</p>;

  return (
    <div className="flex flex-col gap-2">
      {milestones.map((m) => (
        <MilestoneRow
          key={m.id}
          milestone={m}
          totalCents={totalCents}
          overAllocated={overAllocated}
          clientId={clientId}
          salesRepId={salesRepId}
          estimateId={estimateId}
        />
      ))}
      {milestones.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-4 text-center text-xs text-slate-400">
          No milestones yet — add one below (e.g. Deposit, Rough-in, Completion).
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 self-start border-dashed text-xs"
        onClick={handleAdd}
        disabled={create.isPending}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Milestone
      </Button>
      {milestones.length > 0 && diffCents !== 0 && (
        <p className={cn("text-[10px]", diffCents > 0 ? "text-amber-600" : "text-red-500")}>
          Milestones {diffCents > 0 ? "total less than" : "total more than"} the estimate by {formatCurrency(Math.abs(diffCents))}.
        </p>
      )}
    </div>
  );
}
