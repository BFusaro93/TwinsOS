"use client";

import { useState } from "react";
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
import { CalendarDays, Briefcase, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, roundHours } from "@/lib/utils";
import { useCreateJobsFromEstimate, useCRMCrews, useCRMSchedules } from "@/lib/hooks/use-crm-jobs";
import { useClientProjects } from "@/lib/hooks/use-client-cmms";
import { NewProjectDialog } from "@/components/po/NewProjectDialog";
import { budgetedHoursFromLineItem } from "@/lib/estimate-calc";
import { useRequiredFields } from "@/lib/hooks/use-required-fields";
import type { Estimate, EstimateLineItem, EstimateDirectCost } from "@/types/crm-estimates";

const JOB_TYPES = [
  { value: "one_time",    label: "One Time" },
  { value: "recurring",   label: "Recurring" },
  { value: "project",     label: "Project" },
  { value: "waiting_list",label: "Waiting List" },
];

/**
 * Net revenue per selected line after the line's own discount and its share
 * of the estimate-level discount. Mirrors recalcEstimateTotals: a "percent"
 * header discount is a % of the (line-discounted) subtotal; a flat one is a
 * fixed amount clamped to the subtotal, of which the selected lines carry
 * their proportional share. Cents are distributed largest-remainder so the
 * allocated discount sums exactly.
 */
function allocateHeaderDiscount(
  estimate: Estimate,
  allLines: EstimateLineItem[],
  selectedLines: EstimateLineItem[],
): Map<string, number> {
  const lineNet = (li: EstimateLineItem) => Math.max(0, li.totalCents - li.discountCents);
  const fullSubtotal = allLines.reduce((s, li) => s + lineNet(li), 0);
  const selectedSubtotal = selectedLines.reduce((s, li) => s + lineNet(li), 0);

  let headerDiscount = 0;
  if (estimate.discountType === "percent") {
    headerDiscount = Math.round(selectedSubtotal * ((estimate.discountValue ?? 0) / 10000));
  } else if ((estimate.discountCents ?? 0) > 0 && fullSubtotal > 0) {
    const clamped = Math.min(estimate.discountCents, fullSubtotal);
    headerDiscount = Math.round(clamped * (selectedSubtotal / fullSubtotal));
  }
  headerDiscount = Math.max(0, Math.min(headerDiscount, selectedSubtotal));

  const result = new Map<string, number>();
  if (headerDiscount === 0 || selectedSubtotal === 0) {
    for (const li of selectedLines) result.set(li.id, lineNet(li));
    return result;
  }

  const shares = selectedLines.map((li) => {
    const exact = (headerDiscount * lineNet(li)) / selectedSubtotal;
    return { id: li.id, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let remainder = headerDiscount - shares.reduce((s, x) => s + x.floor, 0);
  for (const x of [...shares].sort((a, b) => b.frac - a.frac)) {
    if (remainder <= 0) break;
    x.floor += 1;
    remainder -= 1;
  }
  const discountById = new Map(shares.map((x) => [x.id, x.floor]));
  for (const li of selectedLines) {
    result.set(li.id, Math.max(0, lineNet(li) - (discountById.get(li.id) ?? 0)));
  }
  return result;
}

interface Props {
  open: boolean;
  estimate: Estimate;
  onClose: () => void;
  onConverted: (jobId: string) => void;
}

export function ConvertToJobDialog({ open, estimate, onClose, onConverted }: Props) {
  const lineItems = (estimate.lineItems ?? []).filter((li) => !li.deletedAt);
  // Only catalog-linked product/material direct costs feed forward into job-level
  // demand (crm_job_products) — free-text costs have nothing to link an order to.
  const materialItems = (estimate.directCosts ?? []).filter(
    (dc) => dc.costType === "product_material" && !!dc.productItemId
  );

  // Default to items the client actually accepted — items marked "lost" on a per-item
  // acceptance (portal or public proposal) are left unchecked, but still selectable.
  // $0 lines (net of their own discount) are also left unchecked: they'd otherwise
  // convert into billable $0 services on the job.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(
      lineItems
        .filter((li) => li.status !== "lost" && Math.max(0, li.totalCents - (li.discountCents ?? 0)) > 0)
        .map((li) => li.id)
    )
  );
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

  const { data: crews = [] } = useCRMCrews();
  const { data: crmSchedules = [] } = useCRMSchedules();
  const rf = useRequiredFields("job");
  const { data: clientProjects } = useClientProjects(estimate.clientId, estimate.clientName ?? "");
  const createJobs = useCreateJobsFromEstimate();
  // All-in estimated cost (revenue - net profit) — seeds a linked project's EAC
  // if it's still unset. See rpt_projects_wip / the WIP report this feeds.
  const eacHintCents = estimate.revenueCents - estimate.netProfitCents;

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(lineItems.map((li) => li.id)) : new Set());
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

  const selectedItems = lineItems.filter((li) => selected.has(li.id));
  // Net of each line's own discount AND its share of the estimate-level
  // (header) discount — this is what the client actually agreed to pay, and
  // what feeds the new job's rate_cents snapshot below. Before the header
  // discount was included here, a 10%-off estimate produced a job (and thus
  // an invoice) priced at the undiscounted subtotal.
  const netByLineId = allocateHeaderDiscount(estimate, lineItems, selectedItems);
  const totalCents = selectedItems.reduce((s, li) => s + (netByLineId.get(li.id) ?? 0), 0);
  const selectedMaterialItems = materialItems.filter((dc) => selectedMaterials.has(dc.id));

  async function handleCreate() {
    if (selectedItems.length === 0) {
      toast.error("Select at least one service line");
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

    try {
      const { jobId } = await createJobs.mutateAsync({
        estimateId: estimate.id,
        clientId: estimate.clientId,
        jobType,
        scheduledDate: scheduledDate || null,
        crewId: crewId || null,
        manCount,
        schedule: jobType === "recurring" ? schedule : null,
        notesToCrew: notesToCrew || null,
        projectId: jobType === "project" ? projectId : null,
        eacHintCents,
        services: selectedItems.map((li) => ({
          serviceName:   li.serviceName ?? "Service",
          serviceId:     li.serviceId ?? null,
          qty:           li.qty,
          // The estimate's own total is priced off adjRateCents when the
          // estimator used the Adj Rate column (estimate-calc.ts uses
          // `adjRateCents ?? rateCents`) -- sending the un-adjusted rate
          // here left qty x rateCents != totalCents on the created job's
          // service, so anything re-deriving a price from qty x rate
          // (job value rollups, invoice line items) billed a different
          // number than the client actually accepted.
          // When a header discount applies, re-derive the unit rate from the
          // net line total so qty x rate still reproduces what the job bills.
          rateCents:     netByLineId.get(li.id) === li.totalCents - li.discountCents
            ? (li.adjRateCents ?? li.rateCents)
            : (li.qty > 0 ? Math.round((netByLineId.get(li.id) ?? 0) / li.qty) : (li.adjRateCents ?? li.rateCents)),
          totalCents:    netByLineId.get(li.id) ?? 0,
          budgetedHours: roundHours(budgetedHoursFromLineItem(li)),
          budgetMethod:  li.budgetMethod,
        })),
        materials: selectedMaterialItems.map((dc) => ({
          productItemId:  dc.productItemId as string,
          productName:    dc.description,
          qty:            materialQty[dc.id] ?? dc.qty,
          unitPriceCents: dc.rateCents,
        })),
      });

      toast.success("Job created from estimate");
      onConverted(jobId);
      onClose();
    } catch {
      toast.error("Failed to create job");
    }
  }

  const allSelected = lineItems.length > 0 && selected.size === lineItems.length;

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-green-600" />
            Convert Estimate to Job
          </DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            Select which services to include, then set a scheduled date and crew.
          </p>
        </DialogHeader>

        {/* Client summary */}
        <div className="rounded-lg bg-slate-50 border px-4 py-3 text-sm">
          <p className="font-medium text-slate-800">{estimate.clientName ?? "Unknown Client"}</p>
          {estimate.clientAddress && (
            <p className="text-slate-500 text-xs mt-0.5">
              {estimate.clientAddress}, {estimate.clientCity}, {estimate.clientState}
            </p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">Estimate #{estimate.estimateNumber} — {estimate.description}</p>
        </div>

        {/* Line item selector */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Services to Include
            </Label>
            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => toggleAll(!!v)}
              />
              Select all
            </label>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-xs text-slate-500 font-semibold uppercase tracking-wide">
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
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-xs">
                      No line items on this estimate.
                    </td>
                  </tr>
                )}
                {lineItems.map((li) => (
                  <ServiceRow
                    key={li.id}
                    li={li}
                    checked={selected.has(li.id)}
                    onToggle={() => toggleItem(li.id)}
                  />
                ))}
              </tbody>
              {selectedItems.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-slate-50">
                    <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-slate-600 text-right">
                      {selectedItems.length} service{selectedItems.length !== 1 ? "s" : ""} selected
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-slate-800">
                      {formatCurrency(totalCents)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Materials selector */}
        {materialItems.length > 0 && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Materials to Include
            </Label>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b text-xs text-slate-500 font-semibold uppercase tracking-wide">
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
            <p className="text-[11px] text-slate-400">
              Selected materials are added to the job&apos;s Products section so upcoming demand shows on the Materials Needed report.
            </p>
          </div>
        )}

        {/* Job settings */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium text-slate-600">Job Type</Label>
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
            <Label className="text-xs font-medium text-slate-600">
              <CalendarDays className="inline h-3.5 w-3.5 mr-1" />
              Scheduled Date
              <span className="ml-1 text-slate-400 font-normal">(optional)</span>
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
              <Label className="text-xs font-medium text-slate-600">Project</Label>
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
              <p className="text-[11px] text-slate-400">
                Links this job to a Projects (PO cost-tracking) record for job costing and the WIP report.
              </p>
            </div>
          )}

          {jobType === "recurring" && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium text-slate-600">Schedule *</Label>
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
            <Label className="text-xs font-medium text-slate-600">Assign Crew{rf.req("crew")}</Label>
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
            <Label className="text-xs font-medium text-slate-600">Crew Size (men)</Label>
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
            <Label className="text-xs font-medium text-slate-600">Notes to Crew / Job Notes</Label>
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
        onCreated={(project) => setProjectId(project.id)}
      />
    )}
    </>
  );
}

function ServiceRow({
  li,
  checked,
  onToggle,
}: {
  li: EstimateLineItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <tr
      className={`border-b last:border-0 cursor-pointer transition-colors ${
        checked ? "bg-green-50" : "hover:bg-slate-50"
      }`}
      onClick={onToggle}
    >
      <td className="px-3 py-2.5 text-center">
        <Checkbox checked={checked} onCheckedChange={onToggle} onClick={(e) => e.stopPropagation()} />
      </td>
      <td className="px-3 py-2.5 font-medium text-slate-800">
        {li.serviceName ?? "—"}
        {li.status && li.status !== "quote" && (
          <span className="ml-2 text-[10px] text-slate-400 font-normal uppercase">{li.status}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{li.visits}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{li.qty}</td>
      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
        {formatCurrency(li.totalCents)}
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
    <tr className={`border-b last:border-0 transition-colors ${checked ? "bg-green-50" : "hover:bg-slate-50"}`}>
      <td className="px-3 py-2.5 text-center cursor-pointer" onClick={onToggle}>
        <Checkbox checked={checked} onCheckedChange={onToggle} onClick={(e) => e.stopPropagation()} />
      </td>
      <td className="px-3 py-2.5 font-medium text-slate-800 cursor-pointer" onClick={onToggle}>
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
