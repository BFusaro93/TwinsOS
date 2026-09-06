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
import { DecimalInput } from "@/components/shared/DecimalInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateClientJob, useCRMServices, useCRMSchedules, useCRMCrews } from "@/lib/hooks/use-crm-jobs";
import { useProducts } from "@/lib/hooks/use-products";
import { useClients } from "@/lib/hooks/use-clients";
import { useClientProjects } from "@/lib/hooks/use-client-cmms";
import { useContracts } from "@/lib/hooks/use-contracts";
import { useSelectableEmployees } from "@/lib/hooks/use-employees";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { usePackages } from "@/lib/hooks/use-packages";
import { computePackageVisitSchedule } from "@/lib/package-schedule";
import { computeJobServiceBudgetedHours } from "@/lib/estimate-calc";
import { formatCurrency, roundHours } from "@/lib/utils";
import { ClientCombobox } from "@/components/shared/ClientCombobox";
import { NewProjectDialog } from "@/components/po/NewProjectDialog";
import { useRequiredFields } from "@/lib/hooks/use-required-fields";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { JobType, BudgetMethod } from "@/types/crm-jobs";

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  return toLocalDateStr(new Date());
}

// computePackageVisitSchedule builds dates at local midnight (`new Date(s +
// "T00:00:00")`) — .toISOString() converts through UTC, which rolls local
// midnight back to the previous day in any negative UTC-offset timezone (all
// US timezones), scheduling every package job one day earlier than intended.
function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole-day difference `b - a` between two YYYY-MM-DD strings (local calendar). */
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86_400_000);
}

/** Shift a YYYY-MM-DD string by `n` days (local calendar); empty stays empty. */
function shiftDateStr(iso: string, n: number): string {
  if (!iso) return iso;
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
}

/** Calendar months spanned by [from, to], inclusive of both end months (min 1). */
function monthsSpanned(from: string, to: string): number {
  if (!from || !to || to < from) return 1;
  const a = new Date(from + "T00:00:00"), b = new Date(to + "T00:00:00");
  return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1);
}

const JOB_TYPE_OPTIONS: { value: JobType; label: string }[] = [
  { value: "one_time",     label: "One Time" },
  { value: "recurring",    label: "Recurring" },
  { value: "waiting_list", label: "Waiting List" },
  { value: "package",      label: "Package" },
  { value: "snow",         label: "Snow" },
  { value: "project",      label: "Project" },
];

interface ServiceRow {
  serviceId: string;
  serviceName: string;
  startDate: string;
  completeByDate: string;
  qty: number;
  rateCents: number;
  budgetedHours: number;
  budgetMethod: BudgetMethod;
  teamSize: number;
  /** Days that must elapse after this service's visit completes before the next package-sequenced service is due. */
  minDays: number | null;
  /** True once the user has typed a date into this row — the header Start
   *  Date then stops re-syncing it. */
  startDateEdited: boolean;
}

function blankServiceRow(date: string): ServiceRow {
  return { serviceId: "", serviceName: "", startDate: date, completeByDate: "", qty: 1, rateCents: 0, budgetedHours: 0, budgetMethod: "manual", teamSize: 1, minDays: null, startDateEdited: false };
}

interface ProductRow {
  productId: string;
  productName: string;
  qty: number;
  unitPriceCents: number;
  unitCostCents: number | null;
}

function blankProductRow(): ProductRow {
  return { productId: "", productName: "", qty: 1, unitPriceCents: 0, unitCostCents: null };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  initialJobType?: JobType;
  /** Show a Job Type selector in the dialog. Defaults to true when no
   *  `initialJobType` is given (Jobs page "Add Job", Quick Add), so those
   *  entry points aren't locked to one_time. */
  allowTypeChange?: boolean;
  onCreated?: (jobId: string) => void;
}

export function NewJobDialog({ open, onOpenChange, clientId: defaultClientId, initialJobType, allowTypeChange, onCreated }: Props) {
  const showTypeSelector = allowTypeChange ?? initialJobType == null;
  const createJob = useCreateClientJob();
  const { data: clients } = useClients();
  const { data: crmServices } = useCRMServices();
  const { data: crmSchedules } = useCRMSchedules();
  const { data: orgSettings } = useOrgSettings();
  const { data: crmPackages } = usePackages(false);
  const { data: products } = useProducts();
  const { data: employees } = useSelectableEmployees();
  const { data: crews } = useCRMCrews();
  const salesReps = (employees ?? []).filter((e) => e.isSalesRep);
  const rf = useRequiredFields("job");

  const [selectedClientId, setSelectedClientId] = useState(defaultClientId ?? "");
  const [jobType, setJobType] = useState<JobType>(initialJobType ?? "one_time");
  const { data: contracts } = useContracts(defaultClientId ?? selectedClientId);
  const [contractId, setContractId] = useState<string | null>(null);
  const [salesRepId, setSalesRepId] = useState<string | null>(null);
  const [crewId, setCrewId] = useState<string | null>(null);
  const [notesToCrew, setNotesToCrew] = useState("");
  const [isPending, setIsPending] = useState(false);

  const [startDate, setStartDate] = useState(todayStr());
  const [completeByDate, setCompleteByDate] = useState("");
  /** Recurring only — last date visits are generated for (crm_jobs.recurrence_end). */
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  /** Package only — the date the step windows are currently anchored to, so a
   *  Start Date change can shift every window by the same offset. */
  const [packageAnchor, setPackageAnchor] = useState<string | null>(null);
  const [schedule, setSchedule] = useState("");
  const [packageId, setPackageId] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [services, setServices] = useState<ServiceRow[]>([blankServiceRow(todayStr())]);
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  // Snow-specific billing fields
  const [invoiceType, setInvoiceType] = useState<string | null>(null);
  const [inchTrigger, setInchTrigger] = useState<number | null>(null);
  const [ratePerInchCents, setRatePerInchCents] = useState<number | null>(null);
  const [assetType, setAssetType] = useState("");
  const [snowDaysAuthorized, setSnowDaysAuthorized] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      const today = todayStr();
      setJobType(initialJobType ?? "one_time");
      setContractId(null);
      setCrewId(null);
      setNotesToCrew("");
      setStartDate(today);
      setCompleteByDate("");
      setRecurrenceEnd("");
      setPackageAnchor(null);
      setSchedule("");
      setPackageId("");
      setIsComplete(false);
      setServices([blankServiceRow(today)]);
      setProductRows([]);
      setProjectId(null);
      setInvoiceType(null);
      setInchTrigger(null);
      setRatePerInchCents(null);
      setAssetType("");
      setSnowDaysAuthorized([]);
    }
  }, [open, initialJobType]);

  function toggleSnowDay(d: string) {
    setSnowDaysAuthorized((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function pickPackage(id: string) {
    setPackageId(id);
    const pkg = (crmPackages ?? []).find((p) => p.id === id);
    if (!pkg) return;

    const visitSchedule = computePackageVisitSchedule(pkg.services ?? []);
    const dated = visitSchedule.filter((v) => v.scheduledDate);
    if (dated.length > 0) {
      const earliest = dated.reduce((min, v) => (v.scheduledDate! < min ? v.scheduledDate! : min), dated[0].scheduledDate!);
      const latest = dated.reduce((max, v) => {
        const end = v.service.endDate ? new Date(v.service.endDate + "T00:00:00") : v.scheduledDate!;
        return end > max ? end : max;
      }, earliest);
      setStartDate(toLocalDateStr(earliest));
      setCompleteByDate(toLocalDateStr(latest));
      setPackageAnchor(toLocalDateStr(earliest));
    } else {
      setPackageAnchor(null);
    }

    setServices(
      visitSchedule.length > 0
        ? visitSchedule.map(({ service, scheduledDate }) => {
            // Package steps may reference the service by id OR only carry its
            // name (older packages) — fall back to a name match so the step
            // still inherits the service's default rate / production rate.
            const matchingService = (crmServices ?? []).find((s) => s.id === service.serviceId)
              ?? (crmServices ?? []).find((s) => s.name.trim().toLowerCase() === service.serviceName.trim().toLowerCase());
            const qty = 1;
            return {
              serviceId: service.serviceId ?? matchingService?.id ?? "",
              serviceName: service.serviceName,
              startDate: scheduledDate ? toLocalDateStr(scheduledDate) : "",
              completeByDate: service.endDate ?? "",
              qty,
              rateCents: (service.defaultRateCents || matchingService?.defaultRateCents) ?? 0,
              budgetedHours: matchingService
                ? computeJobServiceBudgetedHours(matchingService, qty)
                : service.defaultBHrs ?? 0,
              budgetMethod: matchingService?.budgetMethod ?? "manual",
              teamSize: 1,
              minDays: service.minDays ?? null,
              startDateEdited: false,
            };
          })
        : [blankServiceRow(startDate)]
    );
  }

  /** Header Start Date changed. Package jobs: shift every step window (and
   *  Complete By) by the same offset so the program re-anchors to the new
   *  start instead of staying on the package's template dates. Other types:
   *  re-sync service-row start dates the user hasn't hand-edited. */
  function changeStartDate(next: string) {
    setStartDate(next);
    if (!next) return;
    if (jobType === "package" && packageAnchor) {
      const offset = daysBetween(packageAnchor, next);
      if (offset !== 0) {
        setServices((prev) => prev.map((s) => ({
          ...s,
          startDate: shiftDateStr(s.startDate, offset),
          completeByDate: shiftDateStr(s.completeByDate, offset),
        })));
        setCompleteByDate((prev) => shiftDateStr(prev, offset));
      }
      setPackageAnchor(next);
      return;
    }
    setServices((prev) => prev.map((s) => (s.startDateEdited ? s : { ...s, startDate: next })));
  }

  function changeJobType(next: JobType) {
    setJobType(next);
    // Type-specific inputs don't carry across (a package's step rows make no
    // sense on a one-time job, a schedule only applies to recurring).
    setSchedule("");
    setRecurrenceEnd("");
    setPackageId("");
    setPackageAnchor(null);
    setCompleteByDate("");
    setIsComplete(false);
    setServices([blankServiceRow(startDate)]);
  }

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
    const qty = services[i]?.qty ?? 1;
    // Only fill the service's default rate into an EMPTY rate — a rate the
    // user already typed (e.g. Rate 120, then picking "Salt") must survive.
    const typedRate = services[i]?.rateCents ?? 0;
    updateService(i, {
      serviceId: svc.id,
      serviceName: svc.name,
      rateCents: typedRate > 0 ? typedRate : (svc.defaultRateCents ?? 0),
      budgetedHours: computeJobServiceBudgetedHours(svc, qty),
      budgetMethod: svc.budgetMethod,
    });
  }

  // Is this row's budgeted hours auto-calculated from the service's production rate?
  function rowIsAutoHrs(serviceId: string): boolean {
    const svc = (crmServices ?? []).find((s) => s.id === serviceId);
    return !!svc && svc.budgetMethod === "production_rate" && !!svc.productionRateSqftPerHr && svc.productionRateSqftPerHr > 0 && svc.unit !== "hr" && svc.unit !== "each";
  }

  // Recompute budgeted hours when qty changes, if this row's service uses production rate
  function updateQty(i: number, qty: number) {
    const serviceId = services[i]?.serviceId;
    const svc = (crmServices ?? []).find((s) => s.id === serviceId);
    if (svc && rowIsAutoHrs(serviceId)) {
      updateService(i, { qty, budgetedHours: computeJobServiceBudgetedHours(svc, qty) });
    } else {
      updateService(i, { qty });
    }
  }

  function updateProductRow(i: number, updates: Partial<ProductRow>) {
    setProductRows((prev) => prev.map((p, idx) => idx === i ? { ...p, ...updates } : p));
  }

  function removeProductRow(i: number) {
    setProductRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addProductRow() {
    setProductRows((prev) => [...prev, blankProductRow()]);
  }

  function pickProduct(i: number, productId: string) {
    const prod = (products ?? []).find((p) => p.id === productId);
    if (!prod) return;
    updateProductRow(i, {
      productId: prod.id,
      productName: prod.name,
      unitPriceCents: prod.price,
      unitCostCents: prod.unitCost ?? null,
    });
  }

  const productCatalog = (products ?? []).filter((p) => p.category === "stocked_material" || p.category === "project_material");
  const productTotalCents = productRows.reduce((s, p) => s + p.qty * p.unitPriceCents, 0);

  const effectiveClientId = defaultClientId ?? selectedClientId;
  const effectiveClientName = (clients ?? []).find((c) => c.id === effectiveClientId)?.displayName ?? "";
  const { data: clientProjects } = useClientProjects(effectiveClientId, effectiveClientName);
  const brandColor = orgSettings?.brandColor ?? "#1e1e1e";

  // ── job costing calculations ──
  const serviceTotalCents = services.reduce((s, r) => s + r.qty * r.rateCents, 0);
  const totalBudgetedHours = services.reduce((s, r) => s + r.budgetedHours * r.teamSize, 0);
  const laborRateCents = (orgSettings as { burdenedRateCents?: number } | undefined)?.burdenedRateCents
    ?? DEFAULT_LABOR_RATE * 100;
  const laborCostCents = Math.round(totalBudgetedHours * laborRateCents);
  const grossProfitCents = serviceTotalCents - laborCostCents;
  const marginPct = serviceTotalCents > 0 ? (grossProfitCents / serviceTotalCents) * 100 : 0;

  const selectedPackage = (crmPackages ?? []).find((p) => p.id === packageId) ?? null;
  // Total included visits for the selected package = sum of each service row's
  // visits_included (defaulting to 1 per row), not the number of service rows —
  // matches the same aggregation used in PackageDialog when saving visits_per_season.
  const selectedPackageTotalSteps = selectedPackage
    ? (selectedPackage.services?.reduce((sum, s) => sum + (s.visitsIncluded || 1), 0) || 1)
    : null;
  // Package billing summary — the program total is the sum of its step rates;
  // the monthly installment spreads it over the months the program covers.
  const packageMonths = monthsSpanned(startDate, completeByDate);
  const packageMonthlyCents = Math.round(serviceTotalCents / packageMonths);

  async function handleSubmit() {
    if (!effectiveClientId) { toast.error("Client is required"); return; }
    if (jobType === "recurring" && !schedule) { toast.error("Schedule is required for recurring jobs"); return; }
    if (jobType === "package" && !packageId) { toast.error("Package is required for package jobs"); return; }
    if (services.some((s) => !s.serviceName)) { toast.error("Select a service for each row"); return; }
    if (rf.isRequired("crew") && !crewId) { toast.error("Crew is required"); return; }
    if (rf.isRequired("sales_rep") && !salesRepId) { toast.error("Sales Rep is required"); return; }
    if (jobType === "waiting_list" && startDate && completeByDate && completeByDate < startDate) {
      toast.error("End date cannot be before start date");
      return;
    }
    if (jobType === "recurring" && recurrenceEnd && startDate && recurrenceEnd < startDate) {
      toast.error("End date cannot be before the start date");
      return;
    }

    setIsPending(true);
    try {
      const result = await createJob.mutateAsync({
        clientId: effectiveClientId,
        jobType,
        projectId: jobType === "project" ? projectId : null,
        contractId: contractId ?? null,
        crewId: crewId ?? null,
        schedule: schedule || null,
        scheduleDays: jobType === "snow" ? snowDaysAuthorized : [],
        packageId: jobType === "package" ? (packageId || null) : null,
        packageName: jobType === "package" ? (selectedPackage?.name ?? null) : null,
        packageRenewal: null,
        packageDiscount: null,
        packageTotalSteps: jobType === "package" ? selectedPackageTotalSteps : null,
        conflictDays: [],
        inchTrigger: jobType === "snow" ? inchTrigger : null,
        invoiceType: jobType === "snow" ? invoiceType : null,
        ratePerInchCents: jobType === "snow" ? ratePerInchCents : null,
        assetType: jobType === "snow" ? (assetType || null) : null,
        salesRepId,
        source: null,
        paymentType: null,
        poNumber: null,
        dateSold: null,
        whenToInvoice: null,
        invoiceSeparately: false,
        callAhead: false,
        arrivalWindowHours: null,
        scheduledDate: (jobType !== "waiting_list" && jobType !== "package" && jobType !== "recurring") ? startDate || null : null,
        waitingListStart: (jobType === "waiting_list" || jobType === "package") ? startDate || null : null,
        waitingListEnd: (jobType === "waiting_list" || jobType === "package") ? completeByDate || null : null,
        startDateWindow: jobType === "recurring" ? startDate || null : null,
        endDateWindow: null,
        recurrenceEnd: jobType === "recurring" ? (recurrenceEnd || null) : null,
        isComplete: jobType === "one_time" ? isComplete : false,
        notes: null,
        notesToCrew: notesToCrew || null,
        services: services.map((s, idx) => ({
          serviceId: s.serviceId || null,
          serviceName: s.serviceName,
          startDate: jobType === "one_time" ? (startDate || null) : (s.startDate || startDate || null),
          completeByDate: (jobType === "waiting_list" || jobType === "package") ? (s.completeByDate || completeByDate || null) : null,
          startRecurring: jobType === "recurring" ? startDate || null : null,
          assignedTo: null,
          qty: s.qty,
          rateCents: s.rateCents,
          budgetedHours: roundHours(s.budgetedHours),
          budgetMethod: s.budgetMethod,
          teamSize: s.teamSize,
          daysCount: 1,
          timeStart: null,
          timeEnd: null,
          included: true,
          sortOrder: idx,
          minDays: s.minDays,
        })),
        products: productRows
          .filter((p) => p.productId)
          .map((p) => ({
            productId: p.productId,
            productName: p.productName,
            qty: p.qty,
            unitPriceCents: p.unitPriceCents,
            unitCostCents: p.unitCostCents,
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

  const showCompleteBy = jobType === "waiting_list" || jobType === "package";
  // one_time jobs have a single "Job Date" at the top — no per-service date column needed
  const showServiceDate = jobType !== "recurring" && jobType !== "one_time";

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{JOB_TYPE_TITLE[jobType]}</DialogTitle>
        </DialogHeader>

        {/* Two-column layout: form left, costing panel right */}
        <div className="flex gap-5 py-2">
          <div className="flex flex-1 flex-col gap-4 min-w-0">

            {showTypeSelector && (
              <div className="flex flex-col gap-1.5 max-w-xs">
                <Label>Job Type *</Label>
                <Select value={jobType} onValueChange={(v) => changeJobType(v as JobType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {JOB_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Client + Contract */}
            <div className="grid grid-cols-4 gap-3">
              {!defaultClientId ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Client *</Label>
                  {/* Leads and lost leads can't have jobs — convert the lead first.
                      (crm_jobs also enforces this with a DB trigger.) */}
                  <ClientCombobox
                    clients={(clients ?? [])
                      .filter((c) => c.status !== "inactive" && c.status !== "cancelled" && c.status !== "lead" && c.status !== "lost")
                      .sort((a, b) => a.displayName.localeCompare(b.displayName))}
                    value={selectedClientId}
                    onValueChange={setSelectedClientId}
                    noneLabel="Select client…"
                  />
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
              <div className="flex flex-col gap-1.5">
                <Label>Sales Rep{rf.req("sales_rep")}</Label>
                <Select value={salesRepId ?? "none"} onValueChange={(v) => setSalesRepId(v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Assign sales rep…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {salesReps.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.firstName} {e.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Crew{rf.req("crew")}</Label>
                <Select value={crewId ?? "unassigned"} onValueChange={(v) => setCrewId(v === "unassigned" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {(crews ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Type-specific fields */}
            {jobType === "recurring" && (
              <div className="grid grid-cols-3 gap-3">
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
                  <Input type="date" value={startDate} onChange={(e) => changeStartDate(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>End Date <span className="text-xs font-normal text-slate-400">(optional)</span></Label>
                  <Input type="date" value={recurrenceEnd} min={startDate || undefined} onChange={(e) => setRecurrenceEnd(e.target.value)} />
                  <p className="text-xs text-slate-400">Visits are generated from the start date through this date (or year end if blank).</p>
                </div>
              </div>
            )}

            {jobType === "package" && (
              <div className="flex flex-col gap-1.5">
                <Label>Package *</Label>
                {(crmPackages ?? []).length > 0 ? (
                  <Select value={packageId} onValueChange={pickPackage}>
                    <SelectTrigger><SelectValue placeholder="Select a package…" /></SelectTrigger>
                    <SelectContent>
                      {(crmPackages ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-slate-400">
                    No packages configured yet. Add one in CRM Settings → Packages.
                  </p>
                )}
                {packageId && (
                  <p className="text-xs text-slate-400">
                    Visits and dates below are pulled from the package&rsquo;s schedule — adjust any row for this client if needed.
                  </p>
                )}
              </div>
            )}

            {(jobType === "waiting_list" || jobType === "package") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => changeStartDate(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Complete By</Label>
                  <Input type="date" value={completeByDate} onChange={(e) => setCompleteByDate(e.target.value)} />
                </div>
              </div>
            )}
            {jobType === "package" && (
              <p className="text-xs text-slate-400 -mt-2">
                Package jobs are scheduled within this date range and go to the Waiting List for opportunistic dispatch, rather than a fixed date.
                {packageId && " Changing the Start Date shifts every step window by the same number of days."}
              </p>
            )}
            {jobType === "package" && packageId && (
              <div className="flex items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-500">Monthly</span>
                <span className="font-semibold text-slate-800">{formatCurrency(packageMonthlyCents)}</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-500">Total</span>
                <span className="font-semibold text-slate-800">{formatCurrency(serviceTotalCents)}</span>
                <span className="text-xs text-slate-400">({packageMonths} month{packageMonths === 1 ? "" : "s"}, {services.length} step{services.length === 1 ? "" : "s"})</span>
              </div>
            )}

            {(jobType === "one_time" || jobType === "snow" || jobType === "project") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>{jobType === "one_time" ? "Job Date" : "Start Date"}</Label>
                  <Input type="date" value={startDate} onChange={(e) => changeStartDate(e.target.value)} />
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
                {jobType === "project" && (
                  <div className="flex flex-col gap-1.5">
                    <Label>Project</Label>
                    <div className="flex gap-2">
                      <Select value={projectId ?? "none"} onValueChange={(v) => setProjectId(v === "none" ? null : v)}>
                        <SelectTrigger><SelectValue placeholder="Link a project…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No project linked</SelectItem>
                          {(clientProjects ?? []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="outline" size="sm" disabled={!effectiveClientId} onClick={() => setNewProjectOpen(true)}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {jobType === "snow" && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label># Inch Trigger</Label>
                    <Input
                      type="number" min="0" step="0.5"
                      value={inchTrigger ?? ""}
                      onChange={(e) => setInchTrigger(e.target.value ? Number(e.target.value) : null)}
                      placeholder="e.g. 2"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Invoice Type</Label>
                    <Select value={invoiceType ?? ""} onValueChange={setInvoiceType}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_event">Per Event</SelectItem>
                        <SelectItem value="per_event_per_inch">Per Event, Per Inch</SelectItem>
                        <SelectItem value="per_push_per_inch">Per Push</SelectItem>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="monthly_flat_rate">Monthly Flat Rate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {(invoiceType === "per_event_per_inch" || invoiceType === "per_push_per_inch") && (
                  <div className="flex flex-col gap-1.5">
                    <Label>Rate Per Inch ($)</Label>
                    <Input
                      type="number" min="0" step="0.01"
                      value={ratePerInchCents != null ? ratePerInchCents / 100 : ""}
                      onChange={(e) => setRatePerInchCents(e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
                      placeholder="0.00"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label>Asset Type</Label>
                  <Input value={assetType} onChange={(e) => setAssetType(e.target.value)} placeholder="e.g. Skid Steer" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Days Authorized</Label>
                  <div className="flex gap-1 flex-wrap">
                    {DAYS_OF_WEEK.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleSnowDay(d)}
                        className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                          snowDaysAuthorized.includes(d) ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
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
                <div className="overflow-x-auto">
                {/* Header — uses org brand color. Recurring jobs: no per-row Start Date (use header "Start Recurring") */}
                <div
                  className="grid min-w-[640px] text-white text-xs font-medium px-3 py-2"
                  style={{
                    gridTemplateColumns: showServiceDate
                      ? "1.5fr 1.5fr 1.5fr 0.9fr 0.8fr 0.7fr 1.1fr 28px"
                      : "2fr 1fr 1fr 1fr 1fr 1.5fr 28px",
                    backgroundColor: brandColor,
                  }}
                >
                  <span>Service</span>
                  {showServiceDate && <span>Start Date</span>}
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
                    className="grid min-w-[640px] items-center gap-1.5 border-b last:border-0 bg-white px-3 py-2"
                    style={{
                      gridTemplateColumns: showServiceDate
                        ? "1.5fr 1.5fr 1.5fr 0.9fr 0.8fr 0.7fr 1.1fr 28px"
                        : "2fr 1fr 1fr 1fr 1fr 1.5fr 28px",
                    }}
                  >
                    <Select value={svc.serviceId || ""} onValueChange={(v) => pickService(i, v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select service…" /></SelectTrigger>
                      <SelectContent>
                        {(crmServices ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {showServiceDate && (
                      <Input type="date" value={svc.startDate} onChange={(e) => updateService(i, { startDate: e.target.value, startDateEdited: true })} className="h-7 px-1.5 text-xs" />
                    )}
                    {showCompleteBy ? (
                      <Input type="date" value={svc.completeByDate} onChange={(e) => updateService(i, { completeByDate: e.target.value })} className="h-7 px-1.5 text-xs" />
                    ) : (
                      <Input type="number" min="0" step="0.01" value={svc.qty} onChange={(e) => updateQty(i, parseFloat(e.target.value) || 1)} className="h-7 text-xs" />
                    )}
                    <DecimalInput
                      min={0}
                      className="h-7 text-xs"
                      value={svc.rateCents / 100}
                      selectOnFocus
                      onCommit={(cost) => updateService(i, { rateCents: Math.round(cost * 100) })}
                    />
                    {rowIsAutoHrs(svc.serviceId) ? (
                      <span className="flex h-7 items-center justify-end pr-1 text-xs font-medium text-blue-600" title="Auto-calculated from production rate">
                        {svc.budgetedHours.toFixed(2)}
                      </span>
                    ) : (
                      <DecimalInput
                        min={0}
                        className="h-7 text-xs"
                        value={svc.budgetedHours}
                        selectOnFocus
                        onCommit={(hrs) => updateService(i, { budgetedHours: hrs })}
                      />
                    )}
                    <Input type="number" min="1" step="1" value={svc.teamSize} onChange={(e) => updateService(i, { teamSize: parseInt(e.target.value) || 1 })} className="h-7 text-xs" />
                    <span className="text-xs text-slate-700 font-medium text-right pr-1">{formatCurrency(svc.qty * svc.rateCents)}</span>
                    <button type="button" onClick={() => removeService(i)} disabled={services.length === 1} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-red-500 disabled:opacity-30">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                </div>
                <div className="flex items-center justify-between border-t bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                  <span>Service Total</span>
                  <span>{formatCurrency(serviceTotalCents)}</span>
                </div>
              </div>
            </div>

            {/* Products table */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label>Products</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={addProductRow}>
                  <Plus className="mr-1 h-3 w-3" /> Add Product
                </Button>
              </div>
              <div className="rounded border overflow-hidden">
                <div className="overflow-x-auto">
                <div
                  className="grid min-w-[480px] text-white text-xs font-medium px-3 py-2"
                  style={{ gridTemplateColumns: "2fr 1fr 1fr 1.2fr 28px", backgroundColor: brandColor }}
                >
                  <span>Product</span>
                  <span>Qty</span>
                  <span>Unit Price ($)</span>
                  <span>Total</span>
                  <span />
                </div>
                {productRows.length === 0 && (
                  <div className="px-3 py-3 text-center text-xs text-slate-400 bg-white">No products on this job yet.</div>
                )}
                {productRows.map((row, i) => (
                  <div
                    key={i}
                    className="grid min-w-[480px] items-center gap-1.5 border-b last:border-0 bg-white px-3 py-2"
                    style={{ gridTemplateColumns: "2fr 1fr 1fr 1.2fr 28px" }}
                  >
                    <Select value={row.productId || ""} onValueChange={(v) => pickProduct(i, v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select product…" /></SelectTrigger>
                      <SelectContent>
                        {productCatalog.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" min="0" step="0.01" value={row.qty} onChange={(e) => updateProductRow(i, { qty: parseFloat(e.target.value) || 1 })} className="h-7 text-xs" />
                    <DecimalInput
                      min={0}
                      className="h-7 text-xs"
                      value={row.unitPriceCents / 100}
                      selectOnFocus
                      onCommit={(price) => updateProductRow(i, { unitPriceCents: Math.round(price * 100) })}
                    />
                    <span className="text-xs text-slate-700 font-medium text-right pr-1">{formatCurrency(row.qty * row.unitPriceCents)}</span>
                    <button type="button" onClick={() => removeProductRow(i)} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-red-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                </div>
                {productRows.length > 0 && (
                  <div className="flex items-center justify-between border-t bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                    <span>Product Total</span>
                    <span>{formatCurrency(productTotalCents)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <Label>Notes to Crew / Job Notes</Label>
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
          <Button
            onClick={handleSubmit}
            disabled={
              isPending ||
              (rf.isRequired("crew") && !crewId) ||
              (rf.isRequired("sales_rep") && !salesRepId)
            }
          >
            {isPending ? "Creating…" : "Create Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {jobType === "project" && effectiveClientId && (
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        defaultClientId={effectiveClientId}
        onCreated={(project) => setProjectId(project.id)}
      />
    )}
    </>
  );
}
