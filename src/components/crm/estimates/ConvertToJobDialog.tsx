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
import { CalendarDays, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { useCreateJobsFromEstimate, useCRMCrews } from "@/lib/hooks/use-crm-jobs";
import { budgetedHoursFromLineItem } from "@/lib/estimate-calc";
import type { Estimate, EstimateLineItem, EstimateDirectCost } from "@/types/crm-estimates";

const JOB_TYPES = [
  { value: "one_time",    label: "One Time" },
  { value: "recurring",   label: "Recurring" },
  { value: "project",     label: "Project" },
  { value: "waiting_list",label: "Waiting List" },
];

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
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(lineItems.filter((li) => li.status !== "lost").map((li) => li.id))
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
  const [notesToCrew,   setNotesToCrew]   = useState(() =>
    lineItems.map((li) => li.jobNote).filter(Boolean).join("\n").trim()
  );

  const { data: crews = [] } = useCRMCrews();
  const createJobs = useCreateJobsFromEstimate();

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
  // Net of each line's own discount — this is what the client actually
  // agreed to pay, and what feeds the new job's rate_cents snapshot below.
  const totalCents = selectedItems.reduce((s, li) => s + (li.totalCents - li.discountCents), 0);
  const selectedMaterialItems = materialItems.filter((dc) => selectedMaterials.has(dc.id));

  async function handleCreate() {
    if (selectedItems.length === 0) {
      toast.error("Select at least one service line");
      return;
    }

    try {
      const { jobId } = await createJobs.mutateAsync({
        estimateId: estimate.id,
        clientId: estimate.clientId,
        jobType,
        scheduledDate: scheduledDate || null,
        crewId: crewId || null,
        notesToCrew: notesToCrew || null,
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
          rateCents:     li.adjRateCents ?? li.rateCents,
          totalCents:    li.totalCents - li.discountCents,
          budgetedHours: budgetedHoursFromLineItem(li),
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

          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium text-slate-600">Assign Crew</Label>
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
            disabled={createJobs.isPending || selectedItems.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {createJobs.isPending ? "Creating Job…" : `Create Job (${selectedItems.length} service${selectedItems.length !== 1 ? "s" : ""})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
