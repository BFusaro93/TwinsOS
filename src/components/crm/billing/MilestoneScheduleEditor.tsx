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
import { usePermissions } from "@/lib/hooks/use-permissions";
import { mutationErrorMessage } from "@/lib/utils/mutation-error";
import {
  useEstimateMilestones,
  useProjectMilestones,
  useCreateEstimateMilestone,
  useUpdateEstimateMilestone,
  useDeleteEstimateMilestone,
  useCreateInvoiceFromMilestone,
} from "@/lib/hooks/use-estimate-milestones";
import type { EstimateMilestone } from "@/types/crm-estimates";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { resolvePercentMilestoneAmounts, type MilestoneBasis } from "@/lib/utils/milestone-amounts";

export function amountFor(type: "flat" | "percent", value: number, totalCents: number): number {
  return type === "percent" ? Math.round((totalCents * value) / 10000) : value;
}

function MilestoneRow({
  milestone,
  totalCents,
  resolvedAmountCents,
  overAllocated,
  clientId,
  salesRepId,
  showTargetDate,
  readOnly,
  canInvoice,
}: {
  milestone: EstimateMilestone;
  /** This row's percent basis: the project contract, an add-on estimate's own total, or the estimate total. */
  totalCents: number;
  /** What the saved row bills (percent rows: its basis share, with the last pending row of the
   *  basis absorbing the rounding remainder — the same rule invoicing uses). */
  resolvedAmountCents: number | undefined;
  /** Milestones collectively total more than the basis — block invoicing
   *  until amounts are corrected, so an over-allocation can't turn into a
   *  real invoice that overbills the client past what they agreed to. */
  overAllocated: boolean;
  clientId: string;
  salesRepId: string | null;
  showTargetDate: boolean;
  readOnly: boolean;
  canInvoice: boolean;
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
    }, { onError: (err) => toast.error(mutationErrorMessage(err, "Failed to save milestone")) });
  }

  // An invoiced milestone shows what it was actually BILLED, never a fresh
  // percentage of today's contract. A 30% deposit billed at $12,000 against a
  // $40,000 contract must not start reading $18,000 the moment a change order
  // lifts the contract to $60,000 — the invoice is a fact, and the whole point
  // of change orders adjusting only pending milestones is that billed money
  // stays put.
  const unedited = type === milestone.milestoneType && toMilestoneValue(valueStr) === milestone.milestoneValue;
  const amountCents =
    milestone.status === "invoiced"
      ? milestone.amountCents
      : unedited && resolvedAmountCents !== undefined
        ? resolvedAmountCents
        : amountFor(type, toMilestoneValue(valueStr), totalCents);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 dark:border-neutral-800 bg-slate-50 dark:bg-muted/40 p-2.5">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => { if (name !== milestone.name) update.mutate({ id: milestone.id, ...ids, patch: { name } }, { onError: (err) => toast.error(mutationErrorMessage(err, "Failed to save milestone")) }); }}
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
              update.mutate({ id: milestone.id, ...ids, patch: { targetDate: next } }, { onError: (err) => toast.error(mutationErrorMessage(err, "Failed to save milestone")) });
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
      <span className="w-24 shrink-0 text-right text-sm font-medium text-slate-700 dark:text-neutral-300">
        {formatCurrency(amountCents)}
      </span>
      {milestone.status === "invoiced" ? (
        <>
          <Badge variant="outline" className="shrink-0 border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 text-[10px] text-teal-700 dark:text-teal-400">
            Invoiced
          </Badge>
          {milestone.invoiceId && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-slate-400 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-neutral-300"
              title="Open invoice"
              onClick={() => router.push(`/crm/accounting/invoices/${milestone.invoiceId}`)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      ) : readOnly ? null : (
        <>
          {canInvoice && (
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
                  toast.error(mutationErrorMessage(e, e instanceof Error ? e.message : "Failed to create invoice"));
                }
              }}
            >
              <Receipt className="h-3.5 w-3.5 text-teal-500 dark:text-teal-400" />
              {creatingInvoice ? "Creating…" : "Invoice"}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-slate-400 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400"
            title="Delete milestone"
            onClick={() => del.mutate({ id: milestone.id, ...ids }, { onError: (err) => toast.error(mutationErrorMessage(err, "Failed to delete milestone")) })}
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
 * total on an estimate, the contract price on a project — except an ADD-ON
 * estimate's rows on a project (an estimate converted into a project that came
 * from another one), which resolve against that estimate's own total.
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
  invoiceBlockedReason = null,
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
  /** Set when nothing may be invoiced from this schedule right now (a canceled project — the
   *  database refuses too); hides the Invoice buttons and shows this note instead. */
  invoiceBlockedReason?: string | null;
}) {
  // Exactly one of these is enabled — the disabled hook never fetches.
  const estimateQuery = useEstimateMilestones(projectId ? "" : (estimateId ?? ""));
  const projectQuery = useProjectMilestones(projectId);
  const { data: milestones = [], isLoading } = projectId ? projectQuery : estimateQuery;
  const create = useCreateEstimateMilestone();

  // Mirrors the database guard (20261209000100): a row on a project is edited
  // with the project or invoice key, an estimate-only row with estimate_edit.
  // On an estimate that became a project, the carried rows lock for a user
  // who can edit the estimate but not the project.
  const { can } = usePermissions();
  const canInvoice = can("acct_add_modify_invoices");
  const canEditProjectRows = can("sched_add_modify_projects") || canInvoice;
  const canEditEstimateRows = can("estimate_edit");
  const rowReadOnly = (m: EstimateMilestone) =>
    readOnly || (m.projectId ? !canEditProjectRows : !canEditEstimateRows);
  // A milestone added to a converted estimate lands on its project (the
  // link-project trigger), so it needs the project rights too. The DB resolves
  // that through the converted job, so an estimate converted to a project with
  // no milestones yet counts too — not just one whose rows already carry it.
  const { data: convertedToProject = false } = useQuery({
    queryKey: ["estimate-converted-project", estimateId],
    enabled: !projectId && !!estimateId,
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_jobs")
        .select("id")
        .eq("estimate_id", estimateId)
        .not("project_id", "is", null)
        .is("deleted_at", null)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });
  const addsToProject = !!projectId || convertedToProject || milestones.some((m) => m.projectId);
  const canAdd = !readOnly && (addsToProject ? canEditProjectRows : canEditEstimateRows);

  // A pending percent milestone is worth a percentage of the CURRENT basis,
  // not whatever amount_cents was snapshotted when it was last edited — after
  // a change order those differ, and summing the stale figures made the
  // over/under-allocation warning quote a number that matched neither the
  // rows above it nor what invoicing would actually bill. An invoiced
  // milestone keeps its billed amount: that one is history.
  // On a project the basis is the PRE-tax contract price, but a flat milestone carried from a
  // taxed estimate holds a gross figure (the invoice bills it as entered, tax inside). Compare
  // its pre-tax share, or a complete gross schedule read as over-allocated and every Invoice
  // button was disabled on the project.
  // An ADD-ON estimate's rows (any estimate but the one that seeded the
  // project) resolve against that estimate's own total: its pre-tax share on a
  // pre-tax project, the tax-inclusive total otherwise — the same basis
  // create_invoice_from_milestone bills (20261230000400).
  const { data: projectBasis } = useQuery({
    queryKey: ["project-milestones", projectId, "net-share"],
    enabled: !!projectId,
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [rowsRes, projRes] = await Promise.all([
        db
          .from("estimate_milestones")
          .select("id, amount_is_pretax, estimate_id, estimates(total_cents, tax_cents)")
          .eq("project_id", projectId)
          .is("deleted_at", null),
        db.from("projects").select("source_estimate_id, contract_price_is_pretax").eq("id", projectId).maybeSingle(),
      ]);
      if (rowsRes.error) throw rowsRes.error;
      if (projRes.error) throw projRes.error;
      const seed = (projRes.data?.source_estimate_id as string | null) ?? null;
      const pretax = projRes.data?.contract_price_is_pretax !== false;
      const netShare = new Map<string, number>();
      const addOnBasis = new Map<string, MilestoneBasis>();
      for (const r of (rowsRes.data ?? []) as { id: string; amount_is_pretax: boolean | null; estimate_id: string | null; estimates: { total_cents: number | null; tax_cents: number | null } | null }[]) {
        const total = r.estimates?.total_cents ?? 0;
        const tax = r.estimates?.tax_cents ?? 0;
        if (r.estimate_id && !r.amount_is_pretax && total > 0 && tax > 0) netShare.set(r.id, (total - tax) / total);
        if (r.estimate_id && seed && r.estimate_id !== seed) {
          addOnBasis.set(r.id, { key: `addon:${r.estimate_id}`, basisCents: pretax ? total - tax : total });
        }
      }
      return { netShare, addOnBasis, pretax };
    },
  });
  const basisOf = (m: EstimateMilestone): MilestoneBasis =>
    projectBasis?.addOnBasis.get(m.id) ?? { key: projectId ? "project" : "estimate", basisCents: totalCents };
  const resolvedPercent = resolvePercentMilestoneAmounts(milestones, basisOf);
  // A gross figure (a flat row carried from a taxed estimate, or an add-on's
  // percent share of its tax-inclusive total) compares by its pre-tax share
  // against the pre-tax contract.
  const preTax = (m: EstimateMilestone, cents: number) => {
    const grossPercent = m.milestoneType === "percent" && projectBasis?.addOnBasis.has(m.id) && !projectBasis.pretax;
    const share = m.milestoneType === "flat" || grossPercent ? projectBasis?.netShare.get(m.id) : undefined;
    return share != null ? Math.round(cents * share) : cents;
  };
  const liveAmount = (m: EstimateMilestone) =>
    m.status === "invoiced"
      ? preTax(m, m.amountCents)
      : preTax(m, resolvedPercent.get(m.id) ?? amountFor(m.milestoneType, m.milestoneValue, basisOf(m).basisCents));

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
    }, { onError: (err) => toast.error(mutationErrorMessage(err, "Failed to add milestone")) });
  }

  if (isLoading) return <p className="text-xs text-slate-400 dark:text-neutral-500">Loading milestones…</p>;

  return (
    <div className="flex flex-col gap-2">
      {milestones.map((m) => (
        <MilestoneRow
          key={m.id}
          milestone={m}
          totalCents={basisOf(m).basisCents}
          resolvedAmountCents={resolvedPercent.get(m.id)}
          overAllocated={overAllocated}
          clientId={clientId}
          salesRepId={salesRepId}
          showTargetDate={showTargetDate}
          readOnly={rowReadOnly(m)}
          canInvoice={canInvoice && !invoiceBlockedReason}
        />
      ))}
      {invoiceBlockedReason && milestones.some((m) => m.status !== "invoiced") && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{invoiceBlockedReason}</p>
      )}
      {milestones.length === 0 && (
        <p className="rounded-lg border border-dashed border-border bg-slate-50 dark:bg-muted/40 py-4 text-center text-xs text-slate-400 dark:text-neutral-500">
          No milestones yet — add one below (e.g. Deposit, Rough-in, Completion).
        </p>
      )}
      {canAdd && (
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
            <span className={cn(diffCents > 0 ? "text-amber-600 dark:text-amber-400" : "text-red-500 dark:text-red-400")}>
              Milestones {diffCents > 0 ? "total less than" : "total more than"} the {basisLabel} by {formatCurrency(Math.abs(diffCents))}.
            </span>
          )}
          <span className="text-muted-foreground">
            Invoiced {formatCurrency(invoicedCents)} of {formatCurrency(totalAllocatedCents)} scheduled
          </span>
        </div>
      )}
    </div>
  );
}
