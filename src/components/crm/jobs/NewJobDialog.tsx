"use client";

import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateClientJob, useCRMServices, useCRMSchedules } from "@/lib/hooks/use-crm-jobs";
import { useClients } from "@/lib/hooks/use-clients";
import { useContracts } from "@/lib/hooks/use-contracts";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { formatCurrency } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { JobType } from "@/types/crm-jobs";

const JOB_TYPE_TITLE: Record<JobType, string> = {
  one_time:     "New One Time Job",
  recurring:    "New Recurring Job",
  waiting_list: "New Waiting List Job",
  package:      "New Package Job",
  snow:         "New Snow Job",
  project:      "New Project Job",
};

// Default labor burden rate ($/hr) — overridden by org settings when available
const DEFAULT_LABOR_RATE = 35;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface ServiceRow {
  serviceId: string;
  serviceName: string;
  startDate: string;
  completeByDate: string;
  qty: number;
  rateCents: number;
  budgetedHours: number;
  teamSize: number;
}

function blankServiceRow(date: string): ServiceRow {
  return { serviceId: "", serviceName: "", startDate: date, completeByDate: "", qty: 1, rateCents: 0, budgetedHours: 0, teamSize: 1 };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  initialJobType?: JobType;
  onCreated?: (jobId: string) => void;
}

export function NewJobDialog({ open, onOpenChange, clientId: defaultClientId, initialJobType, onCreated }: Props) {
  const createJob = useCreateClientJob();
  const { data: clients } = useClients();
  const { data: crmServices } = useCRMServices();
  const { data: crmSchedules } = useCRMSchedules();
  const { data: orgSettings } = useOrgSettings();

  const [selectedClientId, setSelectedClientId] = useState(defaultClientId ?? "");
  const [jobType, setJobType] = useState<JobType>(initialJobType ?? "one_time");
  const { data: contracts } = useContracts(defaultClientId ?? selectedClientId);
  const [contractId, setContractId] = useState<string | null>(null);
  const [notesToCrew, setNotesToCrew] = useState("");
  const [isPending, setIsPending] = useState(false);

  const [startDate, setStartDate] = useState(todayStr());
  const [completeByDate, setCompleteByDate] = useState("");
  const [schedule, setSchedule] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [createWorkOrder, setCreateWorkOrder] = useState(false);
  const [services, setServices] = useState<ServiceRow[]>([blankServiceRow(todayStr())]);

  useEffect(() => {
    if (open) {
      const today = todayStr();
      setJobType(initialJobType ?? "one_time");
      setContractId(null);
      setNotesToCrew("");
      setStartDate(today);
      setCompleteByDate("");
      setSchedule("");
      setIsComplete(false);
      setCreateWorkOrder(false);
      setServices([blankServiceRow(today)]);
    }
  }, [open, initialJobType]);

  function updateService(i: number, updates: Partial<ServiceRow>) {
    setServices((prev) => prev.map((s, idx) => idx === i ? { ...s, ...updates } : s));
  }

  function removeService(i: number) {
    setServices((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addService() {
    setServices((prev) => [...prev, blankServiceRow(startDate)]);
  }

  function pickService(i: number, serviceId: string) {
    const svc = (crmServices ?? []).find((s) => s.id === serviceId);
    if (!svc) return;
    updateService(i, {
      serviceId: svc.id,
      serviceName: svc.name,
      rateCents: svc.defaultRateCents ?? 0,
      budgetedHours: svc.defaultBHrs ?? 0,
    });
  }

  const effectiveClientId = defaultClientId ?? selectedClientId;
  const brandColor = orgSettings?.brandColor ?? "#1e1e1e";

  // ── job costing calculations ──
  const serviceTotalCents = services.reduce((s, r) => s + r.qty * r.rateCents, 0);
  const totalBudgetedHours = services.reduce((s, r) => s + r.budgetedHours * r.teamSize, 0);
  const laborRateCents = (orgSettings as { burdenedRateCents?: number } | undefined)?.burdenedRateCents
    ?? DEFAULT_LABOR_RATE * 100;
  const laborCostCents = Math.round(totalBudgetedHours * laborRateCents);
  const grossProfitCents = serviceTotalCents - laborCostCents;
  const marginPct = serviceTotalCents > 0 ? (grossProfitCents / serviceTotalCents) * 100 : 0;

  async function handleSubmit() {
    if (!effectiveClientId) { toast.error("Client is required"); return; }
    if (jobType === "recurring" && !schedule) { toast.error("Schedule is required for recurring jobs"); return; }
    if (services.some((s) => !s.serviceName)) { toast.error("Select a service for each row"); return; }

    setIsPending(true);
    try {
      const result = await createJob.mutateAsync({
        clientId: effectiveClientId,
        jobType,
        contractId: contractId ?? null,
        schedule: schedule || null,
        scheduleDays: [],
        packageName: null,
        packageRenewal: null,
        packageDiscount: null,
        conflictDays: [],
        inchTrigger: null,
        invoiceType: null,
        salesRep: null,
        source: null,
        paymentType: null,
        poNumber: null,
        dateSold: null,
        whenToInvoice: null,
        invoiceSeparately: false,
        callAhead: false,
        arrivalWindowHours: null,
        scheduledDate: (jobType !== "waiting_list" && jobType !== "recurring") ? startDate || null : null,
        waitingListStart: jobType === "waiting_list" ? startDate || null : null,
        waitingListEnd: jobType === "waiting_list" ? completeByDate || null : null,
        startDateWindow: jobType === "recurring" ? startDate || null : null,
        endDateWindow: null,
        createWorkOrder,
        isComplete: jobType === "one_time" ? isComplete : false,
        notes: null,
        notesToCrew: notesToCrew || null,
        services: services.map((s, idx) => ({
          serviceName: s.serviceName,
          startDate: s.startDate || startDate || null,
          completeByDate: jobType === "waiting_list" ? (s.completeByDate || completeByDate || null) : null,
          startRecurring: jobType === "recurring" ? startDate || null : null,
          assignedTo: null,
          qty: s.qty,
          rateCents: s.rateCents,
          budgetedHours: s.budgetedHours,
          teamSize: s.teamSize,
          daysCount: 1,
          timeStart: null,
          timeEnd: null,
          included: true,
          sortOrder: idx,
        })),
      });
      toast.success("Job created");
      onOpenChange(false);
      if (onCreated) onCreated((result as { id: string }).id);
    } catch {
      toast.error("Failed to create job");
    } finally {
      setIsPending(false);
    }
  }

  const showCompleteBy = jobType === "waiting_list";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{JOB_TYPE_TITLE[jobType]}</DialogTitle>
        </DialogHeader>

        {/* Two-column layout: form left, costing panel right */}
        <div className="flex gap-5 py-2">
          <div className="flex flex-1 flex-col gap-4 min-w-0">

            {/* Client + Contract */}
            <div className="grid grid-cols-2 gap-3">
              {!defaultClientId ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Client *</Label>
                  <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
                    <SelectContent>
                      {(clients ?? [])
                        .filter((c) => c.status !== "inactive" && c.status !== "cancelled")
                        .sort((a, b) => a.displayName.localeCompare(b.displayName))
                        .map((c) => <SelectItem key={c.id} value={c.id}>{c.displayName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : <div />}
              <div className="flex flex-col gap-1.5">
                <Label>Contract</Label>
                <Select value={contractId ?? "none"} onValueChange={(v) => setContractId(v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="No contract" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No contract</SelectItem>
                    {(contracts ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Create Work Order */}
            <div className="flex items-center gap-6">
              <Label className="shrink-0 w-40">Create a Work Order?</Label>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="wo" checked={createWorkOrder} onChange={() => setCreateWorkOrder(true)} /> Yes</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="wo" checked={!createWorkOrder} onChange={() => setCreateWorkOrder(false)} /> No</label>
              </div>
            </div>

            {/* Type-specific fields */}
            {jobType === "recurring" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Schedule *</Label>
                  {(crmSchedules ?? []).length > 0 ? (
                    <Select value={schedule} onValueChange={setSchedule}>
                      <SelectTrigger><SelectValue placeholder="Select schedule…" /></SelectTrigger>
                      <SelectContent>
                        {(crmSchedules ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="e.g. Bi-weekly Monday Even" />
                      <p className="text-xs text-slate-400">Configure schedules in CRM Settings → Schedules</p>
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Start Recurring</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
              </div>
            )}

            {jobType === "waiting_list" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Complete By</Label>
                  <Input type="date" value={completeByDate} onChange={(e) => setCompleteByDate(e.target.value)} />
                </div>
              </div>
            )}

            {(jobType === "one_time" || jobType === "package" || jobType === "snow" || jobType === "project") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                {jobType === "one_time" && (
                  <div className="flex flex-col gap-1.5">
                    <Label>Is this job complete?</Label>
                    <div className="flex items-center gap-4 text-sm mt-1">
                      <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="complete" checked={isComplete} onChange={() => setIsComplete(true)} /> Yes</label>
                      <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="complete" checked={!isComplete} onChange={() => setIsComplete(false)} /> No</label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Services table */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label>Services</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={addService}>
                  <Plus className="mr-1 h-3 w-3" /> Add Service
                </Button>
              </div>
              <div className="rounded border overflow-hidden">
                {/* Header — uses org brand color. Recurring jobs: no per-row Start Date (use header "Start Recurring") */}
                <div
                  className="grid text-white text-xs font-medium px-3 py-2"
                  style={{
                    gridTemplateColumns: jobType === "recurring"
                      ? "2fr 1fr 1fr 1fr 1fr 1.5fr 28px"
                      : "2fr 1fr 1fr 1fr 1fr 1fr 1.5fr 28px",
                    backgroundColor: brandColor,
                  }}
                >
                  <span>Service</span>
                  {jobType !== "recurring" && <span>Start Date</span>}
                  <span>{showCompleteBy ? "Complete By" : "Qty"}</span>
                  <span>Rate ($)</span>
                  <span>B. Hrs</span>
                  <span>Team</span>
                  <span>Subtotal</span>
                  <span />
                </div>
                {services.map((svc, i) => (
                  <div
                    key={i}
                    className="grid items-center gap-1.5 border-b last:border-0 bg-white px-3 py-2"
                    style={{
                      gridTemplateColumns: jobType === "recurring"
                        ? "2fr 1fr 1fr 1fr 1fr 1.5fr 28px"
                        : "2fr 1fr 1fr 1fr 1fr 1fr 1.5fr 28px",
                    }}
                  >
                    <Select value={svc.serviceId || ""} onValueChange={(v) => pickService(i, v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select service…" /></SelectTrigger>
                      <SelectContent>
                        {(crmServices ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {jobType !== "recurring" && (
                      <Input type="date" value={svc.startDate} onChange={(e) => updateService(i, { startDate: e.target.value })} className="h-7 text-xs" />
                    )}
                    {showCompleteBy ? (
                      <Input type="date" value={svc.completeByDate} onChange={(e) => updateService(i, { completeByDate: e.target.value })} className="h-7 text-xs" />
                    ) : (
                      <Input type="number" min="0" step="0.01" value={svc.qty} onChange={(e) => updateService(i, { qty: parseFloat(e.target.value) || 1 })} className="h-7 text-xs" />
                    )}
                    <Input
                      type="number" min="0" step="0.01"
                      value={svc.rateCents / 100}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => updateService(i, { rateCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                      className="h-7 text-xs" placeholder="0.00"
                    />
                    <Input type="number" min="0" step="0.25" value={svc.budgetedHours} onChange={(e) => updateService(i, { budgetedHours: parseFloat(e.target.value) || 0 })} className="h-7 text-xs" placeholder="0" />
                    <Input type="number" min="1" step="1" value={svc.teamSize} onChange={(e) => updateService(i, { teamSize: parseInt(e.target.value) || 1 })} className="h-7 text-xs" />
                    <span className="text-xs text-slate-700 font-medium text-right pr-1">{formatCurrency(svc.qty * svc.rateCents)}</span>
                    <button type="button" onClick={() => removeService(i)} disabled={services.length === 1} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-red-500 disabled:opacity-30">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                  <span>Service Total</span>
                  <span>{formatCurrency(serviceTotalCents)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <Label>Notes to Crew</Label>
              <Textarea value={notesToCrew} onChange={(e) => setNotesToCrew(e.target.value)} placeholder="Optional notes visible to the crew…" rows={2} />
            </div>
          </div>

          {/* ── Job costing side panel ── */}
          <div className="w-52 shrink-0 flex flex-col gap-0 rounded-lg border overflow-hidden self-start">
            <div className="px-3 py-2 text-xs font-semibold text-white" style={{ backgroundColor: brandColor }}>
              Job Costing
            </div>
            <div className="flex flex-col divide-y text-xs">
              {[
                { label: "Income", value: formatCurrency(serviceTotalCents), bold: true },
                { label: "Labor Cost", value: formatCurrency(laborCostCents) },
                { label: "Gross Profit", value: formatCurrency(grossProfitCents), colored: true },
                { label: "Margin", value: `${marginPct.toFixed(1)}%`, colored: true },
                { label: "Budget Hrs", value: `${totalBudgetedHours.toFixed(2)} hrs` },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between px-3 py-2">
                  <span className="text-slate-500">{row.label}</span>
                  <span className={
                    row.colored
                      ? grossProfitCents >= 0 ? "font-semibold text-green-600" : "font-semibold text-red-600"
                      : row.bold ? "font-semibold text-slate-800" : "text-slate-700"
                  }>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t bg-slate-50 px-3 py-2 text-[10px] text-slate-400">
              Labor rate from org settings
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Creating…" : "Create Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
