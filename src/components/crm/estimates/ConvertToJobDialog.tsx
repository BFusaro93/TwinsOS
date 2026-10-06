"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, Briefcase, Plus, Tag } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, roundHours, todayLocalISODate } from "@/lib/utils";
import { isoInZone, todayInZone } from "@/lib/time/zone";
import { useCreateJobsFromEstimate, useCRMCrews, useCRMSchedules, useEstimateConvertedLines } from "@/lib/hooks/use-crm-jobs";
import { useClientProjects } from "@/lib/hooks/use-client-cmms";
import { useEstimateShareTokens, useEstimateSubitemTotals } from "@/lib/hooks/use-estimates";
import { useSelectableEmployees } from "@/lib/hooks/use-employees";
import { NewProjectDialog } from "@/components/po/NewProjectDialog";
import { budgetedHoursFromLineItem, tierBasis } from "@/lib/estimate-calc";
import { useRequiredFields } from "@/lib/hooks/use-required-fields";
import type { Estimate, EstimateLineItem, EstimateDirectCost } from "@/types/crm-estimates";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { useConvertLeadToClient } from "@/lib/hooks/use-clients";

const JOB_TYPES = [
  { value: "one_time",    label: "One Time" },
  { value: "recurring",   label: "Recurring" },
  { value: "project",     label: "Project" },
  { value: "waiting_list",label: "Waiting List" },
];

/**
 * What the client agreed to pay for each line: its total less its own
 * discount (floored at 0), plus its priced sub-items (folded into the parent
 * — crm_job_services has no sub-item concept, and recalcEstimateTotals counts
 * them as revenue), less its share of the estimate-level (header) discount.
 *
 * The header discount is computed exactly as recalcEstimateTotals computes it
 * — a percent of the counted subtotal, or a flat amount clamped to it — over
 * the lines the estimate's total is actually made of (`countedLines`: not
 * lost, and only the chosen tier of a Good/Better/Best estimate). It is then
 * split across those lines largest-remainder, ONCE, independent of what is
 * selected: an estimate converted in several passes (one-time lines, then
 * recurring lines) sums to exactly the discounted subtotal, and lost lines or
 * other tiers never absorb (or dilute) any of it. A line outside the counted
 * set (a lost line converted anyway) carries no header discount.
 */
function netByLine(
  estimate: Estimate,
  lines: EstimateLineItem[],
  countedLines: EstimateLineItem[],
  subitemTotals: Record<string, number>,
): Map<string, number> {
  const lineNet = (li: EstimateLineItem) =>
    Math.max(0, li.totalCents - (li.discountCents ?? 0)) + (subitemTotals[li.id] ?? 0);
  const countedSubtotal = countedLines.reduce((s, li) => s + lineNet(li), 0);

  const rawHeader = estimate.discountType === "percent"
    ? Math.round(countedSubtotal * ((estimate.discountValue ?? 0) / 10000))
    : (estimate.discountCents ?? 0);
  const headerDiscount = Math.max(0, Math.min(rawHeader, countedSubtotal));

  const share = new Map<string, number>();
  if (headerDiscount > 0 && countedSubtotal > 0) {
    const parts = countedLines.map((li) => {
      const exact = (headerDiscount * lineNet(li)) / countedSubtotal;
      return { id: li.id, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
    });
    let remainder = headerDiscount - parts.reduce((s, x) => s + x.floor, 0);
    for (const x of [...parts].sort((a, b) => b.frac - a.frac || a.id.localeCompare(b.id))) {
      if (remainder <= 0) break;
      x.floor += 1;
      remainder -= 1;
    }
    for (const x of parts) share.set(x.id, x.floor);
  }

  const result = new Map<string, number>();
  for (const li of lines) result.set(li.id, Math.max(0, lineNet(li) - (share.get(li.id) ?? 0)));
  return result;
}

/**
 * The (qty, per-visit unit rate) pair a job service must carry so that the
 * job bills exactly `net`, the amount the client accepted for that line.
 *
 * crm_job_services stores only qty and an integer rate_cents — there is no
 * total column — and the visit-completion auto-invoice bills qty x rate_cents
 * on EVERY completed visit. So:
 *
 *   * On a RECURRING job the line's visits are the job's visits: the rate is
 *     net / (qty x visits), and the service carries max_visits = visits so
 *     the generator stops where the client's price stops.
 *   * On a one-time (or project / waiting-list) job there is ONE visit that
 *     does the whole line, so the rate is net / qty. Dividing by the line's
 *     visit count there billed a 3-visit line at a third of its price.
 *
 * A fixed-total line's total IS its rate (estimate-calc.ts), so a fixed line
 * with qty > 1 also needs qty divided back out.
 *
 * Whenever `net` isn't exactly divisible by the unit count, no integer rate
 * reproduces it against the estimate's qty — rounding a 13.8c rate up to 14c
 * over 5,000 sq ft billed $700 for a $690 line — so the service falls back to
 * a single unit at the whole per-visit price. On a one-time job (one visit)
 * that is exact. On a RECURRING job it is exact only when `net` divides
 * evenly by the visit count: every visit bills the same qty x rate, and the
 * job model has no way to carry a remainder (one service row per estimate
 * line, and an extra "remainder" service would generate its own visits). So
 * the per-visit price is rounded DOWN — the job never bills more than the
 * client accepted — and `billedCents` reports what it will bill so the dialog
 * can show the shortfall (at most visits - 1 cents, e.g. $100.00 over 3
 * visits bills 3 x $33.33 = $99.99).
 */
function jobServicePricing(
  li: EstimateLineItem,
  net: number,
  recurring: boolean,
): { qty: number; rateCents: number; billedCents: number } {
  const visits = recurring ? Math.max(1, li.visits || 1) : 1;
  const units = (li.qty || 0) * visits;
  if (units > 0) {
    const exactRate = net / units;
    if (Number.isInteger(exactRate)) return { qty: li.qty, rateCents: exactRate, billedCents: net };
  }
  const perVisit = Math.floor(net / visits);
  return { qty: 1, rateCents: perVisit, billedCents: perVisit * visits };
}

interface Props {
  open: boolean;
  estimate: Estimate;
  onClose: () => void;
  onConverted: (jobId: string) => void;
}

export function ConvertToJobDialog({ open, estimate, onClose, onConverted }: Props) {
  // Date Sold is the org's calendar day for the acceptance instant.
  const orgTimeZone = useOrgTimeZone();
  // Section header rows aren't services.
  const lineItems = (estimate.lineItems ?? []).filter((li) => !li.deletedAt && li.rowType !== "section");
  // Direct costs are internal cost (never in the client's price). Catalog-
  // linked product/material rows are still recorded on the job — as
  // NON-billable usage carrying the cost — so job costing sees them.
  const materialItems = (estimate.directCosts ?? []).filter(
    (dc) => dc.costType === "product_material" && !!dc.productItemId
  );
  const { data: subitemTotals = {} } = useEstimateSubitemTotals(estimate.id);
  const { data: convertedInfo } = useEstimateConvertedLines(estimate.id);
  const convertedLineIds = convertedInfo?.convertedLineIds ?? new Set<string>();
  const legacyConverted = !!convertedInfo?.legacyConverted;
  const isConverted = (li: EstimateLineItem) => legacyConverted || convertedLineIds.has(li.id);

  // Default to items the client actually accepted — items marked "lost" on a per-item
  // acceptance (portal or public proposal) are left unchecked, but still selectable.
  // $0 lines (net of their own discount) are also left unchecked: they'd otherwise
  // convert into billable $0 services on the job. Lines already converted to a
  // job are shown but can't be selected again.
  //
  // Tiered (Good/Better/Best) proposals: a tier is chosen by marking the other
  // tiers' lines lost (portal/public acceptance and the office Accepted action
  // do this). An estimate accepted before that still has every tier open —
  // then tiered lines start unchecked and the user picks the tier the client
  // chose; untiered lines still default in.
  const tierOf = (li: EstimateLineItem) => (estimate.tiersEnabled ? li.tier : null);
  const openTiers = new Set(
    lineItems.filter((li) => li.status !== "lost").map(tierOf).filter((t): t is NonNullable<typeof t> => !!t)
  );
  const tierUndecided = openTiers.size > 1;
  const isDefaultSelected = (li: EstimateLineItem) =>
    li.status !== "lost" &&
    Math.max(0, li.totalCents - (li.discountCents ?? 0)) + (subitemTotals[li.id] ?? 0) > 0 &&
    !(tierUndecided && tierOf(li));
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(lineItems.filter(isDefaultSelected).map((li) => li.id))
  );
  // Converted lines drop out of the selection as soon as they're known
  // (the converted-lines query resolves after mount, and after each pass).
  const convertedKey = legacyConverted ? "*" : [...convertedLineIds].sort().join(",");
  useEffect(() => {
    if (!convertedKey) return;
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => !legacyConverted && !convertedLineIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // convertedKey captures the set's contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convertedKey]);
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(
    () => new Set(materialItems.map((dc) => dc.id))
  );
  const [materialQty, setMaterialQty] = useState<Record<string, number>>(
    () => Object.fromEntries(materialItems.map((dc) => [dc.id, dc.qty]))
  );
  const [jobType,       setJobType]       = useState("one_time");
  const [scheduledDate, setScheduledDate] = useState("");
  const [crewId,        setCrewId]        = useState("");
  /** Crew size — lands on crm_jobs.man_count and each visit's men_count (the
   *  dispatch board's MEN column). */
  const [manCount,      setManCount]      = useState(1);
  const [schedule,      setSchedule]      = useState("");
  const [notesToCrew,   setNotesToCrew]   = useState(() =>
    lineItems.map((li) => li.jobNote).filter(Boolean).join("\n").trim()
  );
  const [projectId,     setProjectId]     = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  /** Sales rep for the job — inherits the estimate's rep, overridable here (E-15). */
  const [salesRepId,    setSalesRepId]    = useState<string | null>(estimate.salesRepId ?? null);
  /** Date Sold — defaults to the estimate's acceptance date (portal or public
   *  proposal), else today. Drives the Sales by Date Sold reports (E-09). */
  const [dateSold,      setDateSold]      = useState(() =>
    estimate.portalAcceptedAt ? isoInZone(new Date(estimate.portalAcceptedAt), orgTimeZone) : todayInZone(orgTimeZone)
  );
  const [dateSoldTouched, setDateSoldTouched] = useState(false);
  const { data: shareTokens } = useEstimateShareTokens(estimate.id);
  useEffect(() => {
    // A public-proposal acceptance is only known once the share tokens load;
    // adopt it as the default unless the user already picked a date.
    if (dateSoldTouched || estimate.portalAcceptedAt) return;
    const accepted = (shareTokens ?? [])
      .map((t) => t.acceptedAt)
      .filter((d): d is string => !!d)
      .sort()
      .pop();
    if (accepted) setDateSold(isoInZone(new Date(accepted), orgTimeZone));
  }, [shareTokens, dateSoldTouched, estimate.portalAcceptedAt]);
  const { data: employees } = useSelectableEmployees();
  const salesReps = (employees ?? []).filter((e) => e.isSalesRep || e.id === salesRepId);

  const { data: crews = [] } = useCRMCrews();
  const { data: crmSchedules = [] } = useCRMSchedules();
  const rf = useRequiredFields("job");
  const { data: clientProjects } = useClientProjects(estimate.clientId, estimate.clientName ?? "");
  const createJobs = useCreateJobsFromEstimate();
  const { mutateAsync: convertLead } = useConvertLeadToClient();
  // All-in estimated cost (revenue - net profit) — seeds a linked project's EAC
  // if it's still unset. See rpt_projects_wip / the WIP report this feeds.
  const eacHintCents = estimate.revenueCents - estimate.netProfitCents;

  const convertibleLines = lineItems.filter((li) => !isConverted(li));

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(convertibleLines.map((li) => li.id)) : new Set());
  }

  /** Quick picks for a mixed estimate: its one-time lines (1 visit) go on one
   *  job, its multi-visit lines on a recurring one. Also sets the job type. */
  function selectByVisits(kind: "single" | "multi") {
    const pick = convertibleLines.filter(
      (li) => li.status !== "lost" && (kind === "single" ? (li.visits || 1) <= 1 : (li.visits || 1) > 1)
    );
    setSelected(new Set(pick.map((li) => li.id)));
    setJobType(kind === "single" ? "one_time" : "recurring");
  }

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleMaterial(id: string) {
    setSelectedMaterials((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedItems = lineItems.filter((li) => selected.has(li.id) && !isConverted(li));
  // The lines the estimate's total is made of: not lost, and one tier only —
  // the chosen tier, or, while still undecided, the tier being converted
  // (falling back to the estimate's own basis tier, see tierBasis).
  const selectedTier = selectedItems.map(tierOf).find((t) => !!t) ?? null;
  const basisTier = estimate.tiersEnabled
    ? (selectedTier ?? tierBasis(true, lineItems.map((li) => ({
        tier: li.tier,
        status: li.status,
        netCents: Math.max(0, li.totalCents - (li.discountCents ?? 0)),
      }))))
    : null;
  const countedLines = lineItems.filter(
    (li) => li.status !== "lost" && (!basisTier || !tierOf(li) || tierOf(li) === basisTier)
  );
  const netByLineId = netByLine(estimate, lineItems, countedLines, subitemTotals);
  const totalCents = selectedItems.reduce((s, li) => s + (netByLineId.get(li.id) ?? 0), 0);
  const selectedMaterialItems = materialItems.filter((dc) => selectedMaterials.has(dc.id));
  const recurring = jobType === "recurring";
  // Recurring lines whose accepted price doesn't divide evenly by their visit
  // count — the job bills a few cents less than accepted (jobServicePricing).
  const pricingShortfallCents = recurring
    ? selectedItems.reduce((s, li) => {
        const net = netByLineId.get(li.id) ?? 0;
        return s + (net - jobServicePricing(li, net, true).billedCents);
      }, 0)
    : 0;

  async function handleCreate() {
    if (selectedItems.length === 0) {
      toast.error("Select at least one service line");
      return;
    }
    if (new Set(selectedItems.map(tierOf).filter(Boolean)).size > 1) {
      toast.error("Select the lines for one tier only — the tier the client chose");
      return;
    }
    if (jobType === "recurring" && !schedule) {
      toast.error("Schedule is required for recurring jobs");
      return;
    }
    if (rf.isRequired("crew") && !crewId) {
      toast.error("Crew is required");
      return;
    }
    if (rf.isRequired("sales_rep") && !salesRepId) {
      toast.error("Sales Rep is required");
      return;
    }

    try {
      // Jobs can't be created for a lead (crm_jobs_reject_lead_client), and an
      // accepted estimate is the point a lead becomes a client — convert it
      // here instead of failing after the dialog is filled in. No-op for a
      // client that isn't a lead.
      const { converted } = await convertLead(estimate.clientId);
      if (converted) toast.success(`${estimate.clientName ?? "Lead"} converted to client`);
      const { jobId } = await createJobs.mutateAsync({
        estimateId: estimate.id,
        clientId: estimate.clientId,
        propertyId: estimate.propertyId,
        jobType,
        scheduledDate: scheduledDate || null,
        crewId: crewId || null,
        manCount,
        schedule: jobType === "recurring" ? schedule : null,
        notesToCrew: notesToCrew || null,
        projectId: jobType === "project" ? projectId : null,
        eacHintCents,
        salesRepId,
        dateSold: dateSold || null,
        services: selectedItems.map((li) => {
          const net = netByLineId.get(li.id) ?? 0;
          // Priced from the net the client accepted (line discount, header
          // discount share and sub-items all in) — see jobServicePricing.
          // Deriving from the net rather than the raw rate also carries the
          // Adj Rate column and complexity the estimate total was built on.
          const pricing = jobServicePricing(li, net, recurring);
          return {
            serviceName:   li.serviceName ?? "Service",
            serviceId:     li.serviceId ?? null,
            qty:           pricing.qty,
            rateCents:     pricing.rateCents,
            totalCents:    net,
            // budgetedHoursFromLineItem applies the line's complexity: the stored
            // budgeted_hours is the unscaled base (estimate-calc.ts), but the job
            // is budgeted — and later measured — in the hours the crew will
            // actually spend.
            budgetedHours: roundHours(budgetedHoursFromLineItem(li)),
            budgetMethod:  li.budgetMethod,
            estimateLineItemId: li.id,
            maxVisits:     recurring ? Math.max(1, li.visits || 1) : null,
          };
        }),
        materials: selectedMaterialItems.map((dc) => ({
          productItemId:  dc.productItemId as string,
          productName:    dc.description,
          qty:            materialQty[dc.id] ?? dc.qty,
          unitCostCents:  dc.rateCents,
        })),
      });

      // Mixed estimates convert in passes. Keep the dialog open while lines
      // remain, so the next group (e.g. the recurring lines) can be scheduled
      // as its own job; lines just converted drop out once the converted-lines
      // query refreshes. Materials go on the first job only.
      const remaining = convertibleLines.filter(
        (li) =>
          !selected.has(li.id) &&
          li.status !== "lost" &&
          (netByLineId.get(li.id) ?? 0) > 0 &&
          !(basisTier && tierOf(li) && tierOf(li) !== basisTier)
      );
      if (remaining.length > 0) {
        toast.success(`Job created — ${remaining.length} line${remaining.length !== 1 ? "s" : ""} left to schedule`);
        setSelected(new Set());
        setSelectedMaterials(new Set());
        return;
      }
      toast.success("Job created from estimate");
      onConverted(jobId);
      onClose();
    } catch (err) {
      // Show the real reason where there is one — "already converted" in
      // particular is actionable, and a bare "Failed to create job" invites
      // the user to keep clicking.
      toast.error(err instanceof Error && err.message ? err.message : "Failed to create job");
    }
  }

  const allSelected = convertibleLines.length > 0 && convertibleLines.every((li) => selected.has(li.id));
  const hasSingle = convertibleLines.some((li) => li.status !== "lost" && (li.visits || 1) <= 1);
  const hasMulti = convertibleLines.some((li) => li.status !== "lost" && (li.visits || 1) > 1);

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-green-600 dark:text-green-400" />
            Convert Estimate to Job
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Select which services to include, then set a scheduled date and crew.
          </p>
        </DialogHeader>

        {/* Client summary */}
        <div className="rounded-lg bg-slate-50 dark:bg-muted/40 border px-4 py-3 text-sm">
          <p className="font-medium text-slate-800 dark:text-neutral-100">{estimate.clientName ?? "Unknown Client"}</p>
          {estimate.clientAddress && (
            <p className="text-muted-foreground text-xs mt-0.5">
              {estimate.clientAddress}, {estimate.clientCity}, {estimate.clientState}
            </p>
          )}
          <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">Estimate #{estimate.estimateNumber} — {estimate.description}</p>
        </div>

        {/* Line item selector */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-slate-600 dark:text-neutral-400 uppercase tracking-wide">
              Services to Include
            </Label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => toggleAll(!!v)}
              />
              Select all
            </label>
          </div>
          {hasSingle && hasMulti && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-slate-50 dark:bg-muted/40 px-3 py-2 text-xs text-slate-600 dark:text-neutral-400">
              <span>This estimate mixes one-time and multi-visit lines — convert each group as its own job:</span>
              <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => selectByVisits("single")}>
                One-time lines
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => selectByVisits("multi")}>
                Recurring lines
              </Button>
            </div>
          )}
          {legacyConverted && (
            <p className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              This estimate was converted to a job before line-by-line conversion. Add further services on that job instead.
            </p>
          )}
          {tierUndecided && (
            <p className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              This is a tiered proposal and no tier has been chosen yet. Check the lines for the tier the client picked.
            </p>
          )}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-muted/40 border-b text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 text-left">Service</th>
                  <th className="px-3 py-2 text-right">Visits</th>
                  <th className="px-3 py-2 text-right">QTY</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400 dark:text-neutral-500 text-xs">
                      No line items on this estimate.
                    </td>
                  </tr>
                )}
                {lineItems.map((li) => (
                  <ServiceRow
                    key={li.id}
                    li={li}
                    tierLabel={tierOf(li) ? estimate.tierLabels[tierOf(li)!] : null}
                    checked={selected.has(li.id) && !isConverted(li)}
                    converted={isConverted(li)}
                    netCents={netByLineId.get(li.id) ?? 0}
                    onToggle={() => { if (!isConverted(li)) toggleItem(li.id); }}
                  />
                ))}
              </tbody>
              {selectedItems.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-slate-50 dark:bg-muted/40">
                    <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-neutral-400 text-right">
                      {selectedItems.length} service{selectedItems.length !== 1 ? "s" : ""} selected
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-slate-800 dark:text-neutral-100">
                      {formatCurrency(totalCents)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {pricingShortfallCents > 0 && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Some prices don&apos;t divide evenly across their visits, so each visit is
              rounded down to the cent — this job will bill {formatCurrency(totalCents - pricingShortfallCents)},{" "}
              {formatCurrency(pricingShortfallCents)} less than accepted. Adjust a visit&apos;s
              invoice if the difference matters.
            </p>
          )}
        </div>

        {/* Materials selector */}
        {materialItems.length > 0 && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold text-slate-600 dark:text-neutral-400 uppercase tracking-wide">
              Materials to Include
            </Label>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-muted/40 border-b text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {materialItems.map((dc) => (
                    <MaterialRow
                      key={dc.id}
                      item={dc}
                      checked={selectedMaterials.has(dc.id)}
                      qty={materialQty[dc.id] ?? dc.qty}
                      onToggle={() => toggleMaterial(dc.id)}
                      onQtyChange={(qty) => setMaterialQty((prev) => ({ ...prev, [dc.id]: qty }))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-neutral-500">
              Materials are internal cost, not part of the client&apos;s price: selected ones are recorded on the job&apos;s Products as non-billable usage (at cost) for job costing, and are never invoiced.
            </p>
          </div>
        )}

        {/* Job settings */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium text-slate-600 dark:text-neutral-400">Job Type</Label>
            <Select value={jobType} onValueChange={setJobType}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOB_TYPES.map((jt) => (
                  <SelectItem key={jt.value} value={jt.value}>{jt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium text-slate-600 dark:text-neutral-400">
              <CalendarDays className="inline h-3.5 w-3.5 mr-1" />
              Scheduled Date
              <span className="ml-1 text-slate-400 dark:text-neutral-500 font-normal">(optional)</span>
            </Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="text-sm"
            />
          </div>

          {jobType === "project" && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium text-slate-600 dark:text-neutral-400">Project</Label>
              <div className="flex gap-2">
                <Select value={projectId ?? "none"} onValueChange={(v) => setProjectId(v === "none" ? null : v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Link a project…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project linked</SelectItem>
                    {(clientProjects ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={() => setNewProjectOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-neutral-500">
                Links this job to a Projects (PO cost-tracking) record for job costing and the WIP report.
              </p>
            </div>
          )}

          {jobType === "recurring" && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium text-slate-600 dark:text-neutral-400">Schedule *</Label>
              {crmSchedules.length > 0 ? (
                <Select value={schedule} onValueChange={setSchedule}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Select schedule…" /></SelectTrigger>
                  <SelectContent>
                    {crmSchedules.map((s) => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  placeholder="e.g. Weekly - Monday"
                  className="text-sm"
                />
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium text-slate-600 dark:text-neutral-400">Assign Crew{rf.req("crew")}</Label>
            <Select value={crewId || "none"} onValueChange={(v) => setCrewId(v === "none" ? "" : v)}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {crews.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium text-slate-600 dark:text-neutral-400">Sales Rep{rf.req("sales_rep")}</Label>
            <Select value={salesRepId ?? "none"} onValueChange={(v) => setSalesRepId(v === "none" ? null : v)}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {salesReps.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium text-slate-600 dark:text-neutral-400">
              <Tag className="inline h-3.5 w-3.5 mr-1" />
              Date Sold
            </Label>
            <Input
              type="date"
              value={dateSold}
              onChange={(e) => { setDateSoldTouched(true); setDateSold(e.target.value); }}
              className="text-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium text-slate-600 dark:text-neutral-400">Crew Size (men)</Label>
            <Input
              type="number"
              min={1}
              step={1}
              value={manCount}
              onChange={(e) => setManCount(Math.max(1, Math.round(Number(e.target.value)) || 1))}
              className="text-sm"
            />
          </div>

          <div className="flex flex-col gap-1 col-span-2">
            <Label className="text-xs font-medium text-slate-600 dark:text-neutral-400">Notes to Crew / Job Notes</Label>
            <Textarea
              value={notesToCrew}
              onChange={(e) => setNotesToCrew(e.target.value)}
              rows={2}
              className="text-sm resize-none"
              placeholder="Instructions, access codes, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createJobs.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={createJobs.isPending || selectedItems.length === 0 || (rf.isRequired("crew") && !crewId)}
            className="bg-green-600 hover:bg-green-700"
          >
            {createJobs.isPending ? "Creating Job…" : `Create Job (${selectedItems.length} service${selectedItems.length !== 1 ? "s" : ""})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {jobType === "project" && (
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        defaultClientId={estimate.clientId}
        defaultContractPriceCents={estimate.totalCents}
        defaultName={estimate.description ?? undefined}
        onCreated={(project) => setProjectId(project.id)}
      />
    )}
    </>
  );
}

function ServiceRow({
  li,
  tierLabel,
  checked,
  converted,
  netCents,
  onToggle,
}: {
  li: EstimateLineItem;
  tierLabel: string | null;
  checked: boolean;
  /** Already on a job — shown for reference, can't be converted again. */
  converted: boolean;
  /** What the job will bill for this line (discounts and sub-items in). */
  netCents: number;
  onToggle: () => void;
}) {
  return (
    <tr
      className={`border-b last:border-0 transition-colors ${
        converted ? "opacity-60" : checked ? "bg-green-50 dark:bg-green-950/40 cursor-pointer" : "hover:bg-slate-50 dark:hover:bg-muted/40 cursor-pointer"
      }`}
      onClick={onToggle}
    >
      <td className="px-3 py-2.5 text-center">
        <Checkbox checked={checked} disabled={converted} onCheckedChange={onToggle} onClick={(e) => e.stopPropagation()} />
      </td>
      <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-neutral-100">
        {li.serviceName ?? "—"}
        {tierLabel && (
          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{tierLabel}</span>
        )}
        {converted ? (
          <span className="ml-2 rounded bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 text-[10px] font-normal uppercase text-green-700 dark:text-green-400">Converted</span>
        ) : li.status && li.status !== "quote" && (
          <span className="ml-2 text-[10px] text-slate-400 dark:text-neutral-500 font-normal uppercase">{li.status}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-neutral-400">{li.visits}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-neutral-400">{li.qty}</td>
      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
        {formatCurrency(netCents)}
      </td>
    </tr>
  );
}

function MaterialRow({
  item,
  checked,
  qty,
  onToggle,
  onQtyChange,
}: {
  item: EstimateDirectCost;
  checked: boolean;
  qty: number;
  onToggle: () => void;
  onQtyChange: (qty: number) => void;
}) {
  return (
    <tr className={`border-b last:border-0 transition-colors ${checked ? "bg-green-50 dark:bg-green-950/40" : "hover:bg-slate-50 dark:hover:bg-muted/40"}`}>
      <td className="px-3 py-2.5 text-center cursor-pointer" onClick={onToggle}>
        <Checkbox checked={checked} onCheckedChange={onToggle} onClick={(e) => e.stopPropagation()} />
      </td>
      <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-neutral-100 cursor-pointer" onClick={onToggle}>
        {item.description}
      </td>
      <td className="px-3 py-2.5 text-right">
        <Input
          type="number"
          value={qty}
          onChange={(e) => onQtyChange(Number(e.target.value) || 0)}
          onClick={(e) => e.stopPropagation()}
          className="h-7 w-20 text-right text-xs ml-auto"
        />
      </td>
    </tr>
  );
}
