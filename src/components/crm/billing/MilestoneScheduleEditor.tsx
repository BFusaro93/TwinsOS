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
  useProjectMilestones,
  useCreateEstimateMilestone,
  useUpdateEstimateMilestone,
  useDeleteEstimateMilestone,
  useCreateInvoiceFromMilestone,
} from "@/lib/hooks/use-estimate-milestones";
import type { EstimateMilestone } from "@/types/crm-estimates";

export function amountFor(type: "flat" | "percent", value: number, totalCents: number): number {
  return type === "percent" ? Math.round((totalCents * value) / 10000) : value;
}

function MilestoneRow({
  milestone,
  totalCents,
  overAllocated,
  clientId,
  salesRepId,
  showTargetDate,
  readOnly,
}: {
  milestone: EstimateMilestone;
  totalCents: number;
  /** Milestones collectively total more than the basis — block invoicing
   *  until amounts are corrected, so an over-allocation can't turn into a
   *  real invoice that overbills the client past what they agreed to. */
  overAllocated: boolean;
  clientId: string;
  salesRepId: string | null;
  showTargetDate: boolean;
  readOnly: boolean;
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
  const [targetDate, setTargetDate] = useState(milestone.targetDate ?? "");

  // Always address the row by BOTH of its ids, not the scope it was opened
  // from, so a milestone edited on the project also refreshes the estimate.
  const ids = { estimateId: milestone.estimateId, projectId: milestone.projectId };
  const locked = milestone.status === "invoiced" || readOnly;

  function toMilestoneValue(raw: string): number {
    return Math.round((parseFloat(raw) || 0) * 100);
  }

  function commit(nextType: "flat" | "percent", nextValueStr: string) {
    const milestoneValue = toMilestoneValue(nextValueStr);
    const amountCents = amountFor(nextType, milestoneValue, totalCents);
    update.mutate({
      id: milestone.id,
      ...ids,
      patch: { milestoneType: nextType, milestoneValue, amountCents },
    }, { onError: () => toast.error("Failed to save milestone") });
  }

  // An invoiced milestone shows what it was actually BILLED, never a fresh
  // percentage of today's contract. A 30% deposit billed at $12,000 against a
  // $40,000 contract must not start reading $18,000 the moment a change order
  // lifts the contract to $60,000 — the invoice is a fact, and the whole point
  // of change orders adjusting only pending milestones is that billed money
  // stays put.
  const amountCents =
    milestone.status === "invoiced"
      ? milestone.amountCents
      : amountFor(type, toMilestoneValue(valueStr), totalCents);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => { if (name !== milestone.name) update.mutate({ id: milestone.id, ...ids, patch: { name } }, { onError: () => toast.error("Failed to save milestone") }); }}
        disabled={locked}
        className="h-8 min-w-[8rem] flex-1 text-sm"
        placeholder="e.g. Deposit"
      />
      {showTargetDate && (
        <Input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          onBlur={() => {
            const next = targetDate || null;
            if (next !== (milestone.targetDate ?? null)) {
              update.mutate({ id: milestone.id, ...ids, patch: { targetDate: next } }, { onError: () => toast.error("Failed to save milestone") });
            }
          }}
          disabled={locked}
          className="h-8 w-[9.5rem] text-xs"
        />
      )}
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
      {milestone.status === "invoiced" ? (
        <>
          <Badge variant="outline" className="shrink-0 border-teal-200 bg-teal-50 text-[10px] text-teal-700">
            Invoiced
          </Badge>
          {milestone.invoiceId && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-slate-400 hover:text-slate-700"
              title="Open invoice"
              onClick={() => router.push(`/crm/accounting/invoices/${milestone.invoiceId}`)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      ) : readOnly ? null : (
        <>
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1 text-xs"
            disabled={creatingInvoice || amountCents <= 0 || overAllocated || !clientId}
            title={
              !clientId
                ? "Link a client before invoicing"
                : overAllocated
                  ? "Milestones total more than the contract — fix amounts before invoicing"
                  : undefined
            }
            onClick={async () => {
              try {
                const invoice = await createInvoice({
                  milestone: { ...milestone, name, amountCents },
                  ...ids,
                  clientId,
                  salesRepId,
                });
                toast.success("Invoice created");
                router.push(`/crm/accounting/invoices/${invoice.id}`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to create invoice");
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
            title="Delete milestone"
            onClick={() => del.mutate({ id: milestone.id, ...ids }, { onError: () => toast.error("Failed to delete milestone") })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * One billing schedule, rendered for whichever side you're standing on.
 *
 * Estimate and project share the same `estimate_milestones` rows, so a
 * milestone converted along with its estimate is not copied here — it's the
 * same record, and invoicing it from either surface marks it invoiced on both.
 *
 * `totalCents` is the basis percent milestones resolve against: the estimate
 * total on an estimate, the contract price on a project.
 */
export function MilestoneScheduleEditor({
  estimateId,
  projectId,
  clientId,
  salesRepId,
  totalCents,
  showTargetDate = false,
  readOnly = false,
  basisLabel = "estimate",
}: {
  estimateId?: string | null;
  projectId?: string | null;
  clientId: string;
  salesRepId: string | null;
  totalCents: number;
  showTargetDate?: boolean;
  readOnly?: boolean;
  /** What the over/under-allocation warning compares against, in words. */
  basisLabel?: string;
}) {
  // Exactly one of these is enabled — the disabled hook never fetches.
  const estimateQuery = useEstimateMilestones(projectId ? "" : (estimateId ?? ""));
  const projectQuery = useProjectMilestones(projectId);
  const { data: milestones = [], isLoading } = projectId ? projectQuery : estimateQuery;
  const create = useCreateEstimateMilestone();

  // A pending percent milestone is worth a percentage of the CURRENT basis,
  // not whatever amount_cents was snapshotted when it was last edited — after
  // a change order those differ, and summing the stale figures made the
  // over/under-allocation warning quote a number that matched neither the
  // rows above it nor what invoicing would actually bill. An invoiced
  // milestone keeps its billed amount: that one is history.
  const liveAmount = (m: EstimateMilestone) =>
    m.status === "invoiced" ? m.amountCents : amountFor(m.milestoneType, m.milestoneValue, totalCents);

  const totalAllocatedCents = milestones.reduce((s, m) => s + liveAmount(m), 0);
  const diffCents = totalCents - totalAllocatedCents;
  const overAllocated = diffCents < 0;
  const invoicedCents = milestones
    .filter((m) => m.status === "invoiced")
    .reduce((s, m) => s + m.amountCents, 0);

  function handleAdd() {
    create.mutate({
      estimateId: projectId ? null : estimateId,
      projectId: projectId ?? null,
      name: `Milestone ${milestones.length + 1}`,
      milestoneType: "percent",
      milestoneValue: 0,
      amountCents: 0,
      sortOrder: milestones.length,
    }, { onError: () => toast.error("Failed to add milestone") });
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
          showTargetDate={showTargetDate}
          readOnly={readOnly}
        />
      ))}
      {milestones.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-4 text-center text-xs text-slate-400">
          No milestones yet — add one below (e.g. Deposit, Rough-in, Completion).
        </p>
      )}
      {!readOnly && (
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
      )}
      {milestones.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
          {diffCents !== 0 && (
            <span className={cn(diffCents > 0 ? "text-amber-600" : "text-red-500")}>
              Milestones {diffCents > 0 ? "total less than" : "total more than"} the {basisLabel} by {formatCurrency(Math.abs(diffCents))}.
            </span>
          )}
          <span className="text-slate-500">
            Invoiced {formatCurrency(invoicedCents)} of {formatCurrency(totalAllocatedCents)} scheduled
          </span>
        </div>
      )}
    </div>
  );
}
