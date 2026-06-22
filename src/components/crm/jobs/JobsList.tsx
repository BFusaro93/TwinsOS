"use client";

import { useState } from "react";
import { useClientJobs, useCreateClientJob, useCompleteClientJob, useCreateVisit, useCRMCrews, useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { useClients } from "@/lib/hooks/use-clients";
import { useContracts } from "@/lib/hooks/use-contracts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatCurrency } from "@/lib/utils";
import { Plus, X, CheckCircle, MoreHorizontal, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import type { CRMJob, JobType, NewClientJobFormValues, NewClientJobServiceValues } from "@/types/crm-jobs";

// ── badge helpers ─────────────────────────────────────────────────────────────

const JOB_TYPE_COLOR: Record<JobType, string> = {
  recurring:    "bg-blue-100 text-blue-700",
  one_time:     "bg-slate-100 text-slate-600",
  waiting_list: "bg-yellow-100 text-yellow-700",
  package:      "bg-purple-100 text-purple-700",
  snow:         "bg-cyan-100 text-cyan-700",
  project:      "bg-orange-100 text-orange-700",
};

const JOB_TYPE_LABEL: Record<JobType, string> = {
  recurring:    "Recurring",
  one_time:     "One Time",
  waiting_list: "Waiting List",
  package:      "Package",
  snow:         "Snow",
  project:      "Project",
};

const STATUS_COLOR: Record<string, string> = {
  scheduled:   "bg-green-100 text-green-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed:   "bg-slate-100 text-slate-500",
  cancelled:   "bg-red-100 text-red-600",
  skipped:     "bg-slate-100 text-slate-400",
  hold:        "bg-yellow-100 text-yellow-700",
};

// ── filter pill types ─────────────────────────────────────────────────────────

const FILTER_TYPES: { label: string; value: JobType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Recurring", value: "recurring" },
  { label: "One Time", value: "one_time" },
  { label: "Waiting List", value: "waiting_list" },
  { label: "Package", value: "package" },
  { label: "Snow", value: "snow" },
];

// ── blank service row ─────────────────────────────────────────────────────────

function blankService(sortOrder = 0): NewClientJobServiceValues {
  return {
    serviceName: "",
    startDate: null,
    completeByDate: null,
    startRecurring: null,
    assignedTo: null,
    qty: 1,
    rateCents: 0,
    budgetedHours: 0,
    teamSize: 1,
    daysCount: 1,
    timeStart: null,
    timeEnd: null,
    included: true,
    sortOrder,
  };
}

// ── SCHEDULE OPTIONS ──────────────────────────────────────────────────────────

const SCHEDULE_OPTIONS = [
  "Bi-weekly - Monday - Even Weeks",
  "Bi-weekly - Monday - Odd Weeks",
  "Bi-weekly - Friday - Even Weeks",
  "Bi-weekly - Friday - Odd Weeks",
  "Weekly - Monday",
  "Weekly - Tuesday",
  "Weekly - Wednesday",
  "Weekly - Thursday",
  "Weekly - Friday",
  "Custom",
];

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Job Detail Sheet ──────────────────────────────────────────────────────────

function JobDetailSheet({ job, open, onOpenChange }: { job: CRMJob; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { mutateAsync: completeJob } = useCompleteClientJob();

  async function handleComplete() {
    if (!confirm("Mark this job as complete?")) return;
    try {
      await completeJob(job.id);
      toast.success("Job marked complete");
      onOpenChange(false);
    } catch {
      toast.error("Failed to complete job");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-2">
            <Badge className={cn("capitalize text-xs", JOB_TYPE_COLOR[job.jobType])}>
              {JOB_TYPE_LABEL[job.jobType]}
            </Badge>
            <Badge className={cn("capitalize text-xs", STATUS_COLOR[job.status])}>
              {job.status.replace("_", " ")}
            </Badge>
          </div>
          <SheetTitle className="text-base">
            {job.packageName ?? job.schedule ?? JOB_TYPE_LABEL[job.jobType]}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          {job.schedule && (
            <div className="flex justify-between">
              <span className="text-slate-400">Schedule</span>
              <span className="text-slate-700">{job.schedule}</span>
            </div>
          )}
          {job.salesRep && (
            <div className="flex justify-between">
              <span className="text-slate-400">Sales Rep</span>
              <span className="text-slate-700">{job.salesRep}</span>
            </div>
          )}
          {job.source && (
            <div className="flex justify-between">
              <span className="text-slate-400">Source</span>
              <span className="text-slate-700">{job.source}</span>
            </div>
          )}
          {job.startDateWindow && (
            <div className="flex justify-between">
              <span className="text-slate-400">Date Window</span>
              <span className="text-slate-700">{job.startDateWindow} → {job.endDateWindow ?? "—"}</span>
            </div>
          )}
          {job.notes && (
            <div>
              <p className="text-slate-400 mb-1">Notes</p>
              <p className="text-slate-700 rounded bg-slate-50 p-2 text-xs">{job.notes}</p>
            </div>
          )}

          {(job.services ?? []).length > 0 && (
            <div>
              <p className="font-medium text-slate-700 mb-2">Services</p>
              <div className="divide-y rounded border">
                {(job.services ?? []).map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-slate-700">{s.serviceName || "(unnamed)"}</span>
                    <span className="text-slate-500">{s.qty} × {formatCurrency(s.rateCents ?? 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded border p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Service Total</span>
              <span>{formatCurrency(job.serviceTotalCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Product Total</span>
              <span>{formatCurrency(job.productTotalCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Tax</span>
              <span>{formatCurrency(job.taxCents)}</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-1">
              <span>Total</span>
              <span>{formatCurrency(job.totalCents)}</span>
            </div>
          </div>

          {job.status !== "completed" && job.status !== "cancelled" && (
            <Button size="sm" className="w-full" onClick={handleComplete}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Mark Complete
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Service Line Row ──────────────────────────────────────────────────────────

function ServiceRow({
  svc,
  jobType,
  onChange,
  onDelete,
}: {
  svc: NewClientJobServiceValues;
  jobType: JobType;
  onChange: (updates: Partial<NewClientJobServiceValues>) => void;
  onDelete: () => void;
}) {
  const showCompleteBy = jobType === "waiting_list";
  const showStartRecurring = jobType === "recurring";
  const { data: savedServices = [] } = useCRMServices();

  return (
    <tr className="border-b text-xs">
      <td className="px-2 py-1.5">
        <button type="button" onClick={onDelete} className="text-red-400 hover:text-red-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </td>
      <td className="px-2 py-1.5">
        <select
          value={svc.serviceName}
          onChange={(e) => {
            const name = e.target.value;
            const saved = savedServices.find((s) => s.name === name);
            onChange({
              serviceName: name,
              ...(saved?.defaultRateCents != null ? { rateCents: saved.defaultRateCents } : {}),
            });
          }}
          className="h-7 w-40 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">Select service…</option>
          {savedServices.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="date"
          value={svc.startDate ?? ""}
          onChange={(e) => onChange({ startDate: e.target.value || null })}
          className="h-7 text-xs w-32"
        />
      </td>
      {(showCompleteBy || showStartRecurring) && (
        <td className="px-2 py-1.5">
          <Input
            type="date"
            value={(showCompleteBy ? svc.completeByDate : svc.startRecurring) ?? ""}
            onChange={(e) => {
              const val = e.target.value || null;
              onChange(showCompleteBy ? { completeByDate: val } : { startRecurring: val });
            }}
            className="h-7 text-xs w-32"
          />
        </td>
      )}
      <td className="px-2 py-1.5">
        <Input
          value={svc.assignedTo ?? ""}
          onChange={(e) => onChange({ assignedTo: e.target.value || null })}
          className="h-7 text-xs w-24"
          placeholder="Assigned to"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          value={svc.qty}
          min={1}
          onChange={(e) => onChange({ qty: Number(e.target.value) })}
          className="h-7 text-xs w-14"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          value={svc.rateCents / 100}
          min={0}
          step={0.01}
          onChange={(e) => onChange({ rateCents: Math.round(Number(e.target.value) * 100) })}
          className="h-7 text-xs w-20"
          placeholder="0.00"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          value={svc.budgetedHours}
          min={0}
          step={0.25}
          onChange={(e) => onChange({ budgetedHours: Number(e.target.value) })}
          className="h-7 text-xs w-16"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          value={svc.teamSize}
          min={1}
          onChange={(e) => onChange({ teamSize: Number(e.target.value) })}
          className="h-7 text-xs w-14"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          value={svc.daysCount}
          min={1}
          onChange={(e) => onChange({ daysCount: Number(e.target.value) })}
          className="h-7 text-xs w-14"
        />
      </td>
    </tr>
  );
}

// ── New Job Dialog ────────────────────────────────────────────────────────────

const JOB_TYPE_TABS: { label: string; value: JobType }[] = [
  { label: "Recurring", value: "recurring" },
  { label: "One Time", value: "one_time" },
  { label: "Waiting List", value: "waiting_list" },
  { label: "Package", value: "package" },
  { label: "Snow", value: "snow" },
];

function defaultForm(clientId: string, jobType: JobType): NewClientJobFormValues {
  return {
    clientId,
    jobType,
    contractId: null,
    schedule: null,
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
    startDateWindow: null,
    endDateWindow: null,
    createWorkOrder: false,
    isComplete: false,
    notes: null,
    services: [blankService(0)],
  };
}

function NewJobDialog({
  open,
  onOpenChange,
  defaultClientId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultClientId?: string;
}) {
  const { data: clients } = useClients();
  const { data: contracts } = useContracts(defaultClientId);
  const { mutateAsync: createJob, isPending } = useCreateClientJob();

  const [selectedType, setSelectedType] = useState<JobType>("recurring");
  const [form, setForm] = useState<NewClientJobFormValues>(() =>
    defaultForm(defaultClientId ?? "", "recurring")
  );

  function patch(updates: Partial<NewClientJobFormValues>) {
    setForm((prev) => ({ ...prev, ...updates }));
  }

  function selectType(t: JobType) {
    setSelectedType(t);
    setForm(defaultForm(form.clientId, t));
  }

  function toggleDay(day: string, field: "scheduleDays" | "conflictDays") {
    const arr = form[field];
    patch({ [field]: arr.includes(day) ? arr.filter((d) => d !== day) : [...arr, day] });
  }

  function updateService(i: number, updates: Partial<NewClientJobServiceValues>) {
    const next = form.services.map((s, idx) => (idx === i ? { ...s, ...updates } : s));
    patch({ services: next });
  }

  function deleteService(i: number) {
    patch({ services: form.services.filter((_, idx) => idx !== i) });
  }

  function addService() {
    patch({ services: [...form.services, blankService(form.services.length)] });
  }

  const serviceTotalCents = form.services.reduce((acc, s) => acc + s.qty * s.rateCents, 0);

  async function handleSave() {
    if (!form.clientId) { toast.error("Please select a client"); return; }
    try {
      await createJob({ ...form, serviceTotalCents } as NewClientJobFormValues);
      toast.success("Job created");
      onOpenChange(false);
    } catch {
      toast.error("Failed to create job");
    }
  }

  const showServices = ["recurring", "one_time", "waiting_list"].includes(selectedType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Job</DialogTitle>
        </DialogHeader>

        {/* Type tabs */}
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {JOB_TYPE_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => selectType(t.value)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                selectedType === t.value
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_240px] gap-6">
          {/* Left: form */}
          <div className="space-y-4">
            {/* Client + Contract */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Client</label>
                <Select value={form.clientId} onValueChange={(v) => patch({ clientId: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {(clients ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Contract</label>
                <Select
                  value={form.contractId ?? "none"}
                  onValueChange={(v) => patch({ contractId: v === "none" ? null : v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not part of a contract</SelectItem>
                    {(contracts ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Type-specific fields */}
            {selectedType === "recurring" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Schedule</label>
                  <Select value={form.schedule ?? ""} onValueChange={(v) => patch({ schedule: v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEDULE_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Create Work Order?</label>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={form.createWorkOrder} onChange={() => patch({ createWorkOrder: true })} />
                      Yes
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={!form.createWorkOrder} onChange={() => patch({ createWorkOrder: false })} />
                      No
                    </label>
                  </div>
                </div>
              </div>
            )}

            {selectedType === "one_time" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Create Work Order?</label>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={form.createWorkOrder} onChange={() => patch({ createWorkOrder: true })} />
                      Yes
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={!form.createWorkOrder} onChange={() => patch({ createWorkOrder: false })} />
                      No
                    </label>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Is this job complete?</label>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={form.isComplete} onChange={() => patch({ isComplete: true })} />
                      Yes
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={!form.isComplete} onChange={() => patch({ isComplete: false })} />
                      No
                    </label>
                  </div>
                </div>
              </div>
            )}

            {selectedType === "waiting_list" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Create Work Order?</label>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={form.createWorkOrder} onChange={() => patch({ createWorkOrder: true })} />
                      Yes
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={!form.createWorkOrder} onChange={() => patch({ createWorkOrder: false })} />
                      No
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Start Date Window</label>
                    <Input type="date" value={form.startDateWindow ?? ""} onChange={(e) => patch({ startDateWindow: e.target.value || null })} className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Complete By</label>
                    <Input type="date" value={form.endDateWindow ?? ""} onChange={(e) => patch({ endDateWindow: e.target.value || null })} className="h-8 text-xs" />
                  </div>
                </div>
              </div>
            )}

            {selectedType === "package" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Package Name</label>
                  <Input value={form.packageName ?? ""} onChange={(e) => patch({ packageName: e.target.value || null })} className="h-8 text-xs" placeholder="e.g. 7-Step Fertilizer" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Package Renewal</label>
                    <Input value={form.packageRenewal ?? ""} onChange={(e) => patch({ packageRenewal: e.target.value || null })} className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Package Discount</label>
                    <Input value={form.packageDiscount ?? ""} onChange={(e) => patch({ packageDiscount: e.target.value || null })} className="h-8 text-xs" placeholder="e.g. 10%" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Conflict Days</label>
                  <div className="flex gap-1 flex-wrap">
                    {DAYS_OF_WEEK.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d, "conflictDays")}
                        className={cn(
                          "rounded border px-2 py-0.5 text-xs transition-colors",
                          form.conflictDays.includes(d) ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 bg-white text-slate-600"
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedType === "snow" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600"># Inch Trigger</label>
                    <Input
                      type="number"
                      value={form.inchTrigger ?? ""}
                      min={0}
                      step={0.5}
                      onChange={(e) => patch({ inchTrigger: e.target.value ? Number(e.target.value) : null })}
                      className="h-8 text-xs"
                      placeholder="e.g. 2"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Invoice Type</label>
                    <Select value={form.invoiceType ?? ""} onValueChange={(v) => patch({ invoiceType: v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_event">Per Event</SelectItem>
                        <SelectItem value="per_event_per_inch">Per Event, Per Inch</SelectItem>
                        <SelectItem value="monthly_flat_rate">Monthly Flat Rate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Days Authorized</label>
                  <div className="flex gap-1 flex-wrap">
                    {DAYS_OF_WEEK.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d, "scheduleDays")}
                        className={cn(
                          "rounded border px-2 py-0.5 text-xs transition-colors",
                          form.scheduleDays.includes(d) ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 bg-white text-slate-600"
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: history / upcoming panels (non-package, non-snow) */}
          {showServices && (
            <div className="space-y-2">
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="mb-1 text-xs font-semibold text-blue-600">History</p>
                <p className="text-xs text-blue-400">No history items found.</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-3">
                <p className="mb-1 text-xs font-semibold text-slate-500">Upcoming</p>
                <p className="text-xs text-slate-400">No upcoming items found.</p>
              </div>
            </div>
          )}
        </div>

        {/* Service line items grid */}
        {showServices && (
          <div className="mt-2">
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-slate-700 text-white">
                  <tr>
                    <th className="px-2 py-2 w-6" />
                    <th className="px-2 py-2 text-left">Service</th>
                    <th className="px-2 py-2 text-left">Start Date</th>
                    {selectedType === "waiting_list" && <th className="px-2 py-2 text-left">Complete By</th>}
                    {selectedType === "recurring" && <th className="px-2 py-2 text-left">Start Recurring</th>}
                    <th className="px-2 py-2 text-left">Assigned To</th>
                    <th className="px-2 py-2 text-left">Qty</th>
                    <th className="px-2 py-2 text-left">Rate</th>
                    <th className="px-2 py-2 text-left">B.Hrs</th>
                    <th className="px-2 py-2 text-left">Team</th>
                    <th className="px-2 py-2 text-left">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {form.services.map((svc, i) => (
                    <ServiceRow
                      key={i}
                      svc={svc}
                      jobType={selectedType}
                      onChange={(u) => updateService(i, u)}
                      onDelete={() => deleteService(i)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={addService}
              className="mt-1 flex items-center gap-1 text-xs text-brand-600 hover:underline"
            >
              <Plus className="h-3 w-3" />
              Add Service
            </button>

            {/* Totals */}
            <div className="mt-3 ml-auto w-56 space-y-1 text-xs text-right">
              <div className="flex justify-between">
                <span className="text-slate-400">Service Total</span>
                <span>{formatCurrency(serviceTotalCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Product Total</span>
                <span>{formatCurrency(0)}</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="text-slate-400">Subtotal</span>
                <span>{formatCurrency(serviceTotalCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tax</span>
                <span>{formatCurrency(0)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Total</span>
                <span>{formatCurrency(serviceTotalCents)}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Schedule Visit Popover ────────────────────────────────────────────────────

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ScheduleVisitPopover({ job }: { job: CRMJob }) {
  const { data: crews } = useCRMCrews();
  const { mutateAsync: createVisit, isPending } = useCreateVisit();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayString);
  const [crewId, setCrewId] = useState<string>("none");
  async function handleSchedule() {
    try {
      await createVisit({
        jobId: job.id,
        clientId: job.clientId,
        scheduledDate: date,
        crewId: crewId === "none" ? null : crewId,
        startTime: null,
      });
      toast.success(`Visit scheduled for ${date}`);
      setOpen(false);
    } catch {
      toast.error("Failed to schedule visit");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-brand-600 hover:text-brand-700"
          onClick={(e) => e.stopPropagation()}
        >
          <CalendarPlus className="mr-1 h-3 w-3" />
          Schedule
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold text-slate-700">Schedule Visit</p>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Visit Date</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Crew</label>
          <Select value={crewId} onValueChange={setCrewId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="No crew" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No crew</SelectItem>
              {(crews ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="w-full h-8 text-xs" onClick={handleSchedule} disabled={isPending || !date}>
          {isPending ? "Scheduling…" : "Schedule Visit"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ── Main JobsList ─────────────────────────────────────────────────────────────

interface Props {
  clientId?: string;
}

export function JobsList({ clientId }: Props) {
  const { data: jobs, isLoading } = useClientJobs(clientId);
  const { mutateAsync: completeJob } = useCompleteClientJob();
  const [typeFilter, setTypeFilter] = useState<JobType | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<CRMJob | null>(null);

  const filtered = (jobs ?? []).filter((j) => typeFilter === "all" || j.jobType === typeFilter);

  async function handleComplete(e: React.MouseEvent, job: CRMJob) {
    e.stopPropagation();
    if (!confirm("Mark this job as complete?")) return;
    try {
      await completeJob(job.id);
      toast.success("Job marked complete");
    } catch {
      toast.error("Failed to complete job");
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Jobs</span>
        <div className="flex gap-1 flex-wrap flex-1">
          {FILTER_TYPES.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border",
                typeFilter === f.value
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button size="sm" className="h-8 shrink-0 text-xs" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Job
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Services</th>
              <th className="px-4 py-3">Schedule / Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                  No jobs yet — add the first job for this client
                </td>
              </tr>
            ) : (
              filtered.map((job) => {
                const serviceNames = (job.services ?? [])
                  .filter((s) => s.serviceName)
                  .map((s) => s.serviceName)
                  .join(", ");
                const scheduleInfo = job.schedule ?? (job.startDateWindow ? `${job.startDateWindow} → ${job.endDateWindow ?? "?"}` : job.packageName ?? null);

                return (
                  <tr
                    key={job.id}
                    className="group border-b hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelectedJob(job)}
                  >
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", JOB_TYPE_COLOR[job.jobType])}>
                        {JOB_TYPE_LABEL[job.jobType]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_COLOR[job.status])}>
                        {job.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-xs text-slate-600">
                      {serviceNames || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {scheduleInfo ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">
                      {formatCurrency(job.totalCents)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100">
                        <ScheduleVisitPopover job={job} />
                        {job.status !== "completed" && job.status !== "cancelled" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-green-600 hover:text-green-700"
                            onClick={(e) => handleComplete(e, job)}
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Complete
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400"
                          onClick={(e) => { e.stopPropagation(); setSelectedJob(job); }}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <NewJobDialog open={dialogOpen} onOpenChange={setDialogOpen} defaultClientId={clientId} />

      {selectedJob && (
        <JobDetailSheet
          job={selectedJob}
          open={!!selectedJob}
          onOpenChange={(v) => { if (!v) setSelectedJob(null); }}
        />
      )}
    </div>
  );
}
