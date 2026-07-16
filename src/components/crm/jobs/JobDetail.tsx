"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  useJobDetail,
  useJobVisits,
  useUpdateJob,
  useUpdateJobService,
  useAddJobService,
  useDeleteJobService,
  useCRMServices,
  useCreateVisit,
  useDeleteVisit,
  useDeleteVisitsByDayOfWeek,
  useUpdateVisit,
  useCRMCrews,
  useUpdateJobStatus,
  useCRMSchedules,
  useCreateCRMSchedule,
  useCRMJobProducts,
  useAddCRMJobProduct,
  useUpdateCRMJobProduct,
  useDeleteCRMJobProduct,
} from "@/lib/hooks/use-crm-jobs";
import { useProducts } from "@/lib/hooks/use-products";
import { useCreateInvoiceFromJob } from "@/lib/hooks/use-invoices";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import {
  CalendarPlus,
  Receipt,
  CheckCircle2,
  XCircle,
  MapPin,
  Phone,
  User,
  Clock,
  Save,
  CalendarDays,
  RefreshCw,
  Repeat,
  Pencil,
  Check,
  X,
  Trash2,
  SkipForward,
  Plus,
  FlaskConical,
} from "lucide-react";
import { ChemicalApplicationPanel } from "@/components/crm/chemical/ChemicalApplicationPanel";
import { createClient } from "@/lib/supabase/client";
import type { CRMJobVisit } from "@/types/crm-jobs";
import { JobCostingTab } from "@/components/crm/jobs/JobCostingTab";

const STATUS_COLOR: Record<string, string> = {
  scheduled:   "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  completed:   "bg-green-100 text-green-700",
  cancelled:   "bg-red-100 text-red-600",
  skipped:     "bg-slate-100 text-slate-500",
  hold:        "bg-orange-100 text-orange-700",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled:   "Scheduled",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
  skipped:     "Skipped",
  hold:        "On Hold",
};

const JOB_TYPE_LABEL: Record<string, string> = {
  one_time:     "One Time",
  recurring:    "Recurring",
  waiting_list: "Waiting List",
  package:      "Package",
  snow:         "Snow",
  project:      "Project",
};

const VISIT_STATUS_COLOR: Record<string, string> = {
  scheduled:   "bg-blue-50 text-blue-700",
  dispatched:  "bg-purple-50 text-purple-700",
  in_progress: "bg-yellow-50 text-yellow-700",
  completed:   "bg-green-50 text-green-700",
  cancelled:   "bg-red-50 text-red-600",
  skipped:     "bg-slate-50 text-slate-500",
};

type Tab = "overview" | "services" | "visits" | "notes" | "invoice" | "costing" | "audit";

interface Props {
  jobId: string;
  initialEditing?: boolean;
}

export function JobDetail({ jobId, initialEditing = false }: Props) {
  const router = useRouter();
  const { data: job, isLoading, error: jobError } = useJobDetail(jobId);
  const { data: visits = [], isLoading: visitsLoading } = useJobVisits(jobId);
  const { data: crews = [] } = useCRMCrews();
  const updateJob = useUpdateJob();
  const createVisit = useCreateVisit();
  const updateStatus = useUpdateJobStatus();
  const createInvoice = useCreateInvoiceFromJob();

  const updateJobService = useUpdateJobService();
  const addJobService = useAddJobService();
  const deleteJobService = useDeleteJobService();
  const { data: crmServices = [] } = useCRMServices();
  const { data: jobProducts = [] } = useCRMJobProducts(jobId);
  const addJobProduct = useAddCRMJobProduct();
  const updateJobProduct = useUpdateCRMJobProduct();
  const deleteJobProduct = useDeleteCRMJobProduct();
  const { data: productCatalog = [] } = useProducts();
  const deleteVisit = useDeleteVisit();
  const deleteVisitsByDay = useDeleteVisitsByDayOfWeek();
  const updateVisit = useUpdateVisit();
  const { data: schedules = [] } = useCRMSchedules();
  const createSchedule = useCreateCRMSchedule();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(initialEditing);
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [addingVisit, setAddingVisit] = useState(false);
  const [newVisitDate, setNewVisitDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [newVisitCrew, setNewVisitCrew] = useState("");
  const [newVisitInvoiceDesc, setNewVisitInvoiceDesc] = useState("");
  const [invoicing, setInvoicing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [bulkNote, setBulkNote] = useState("");
  const [addingBulkNote, setAddingBulkNote] = useState(false);
  // service inline editing: serviceId → { qty, rate }
  const [editingSvcId, setEditingSvcId] = useState<string | null>(null);
  const [svcQty, setSvcQty] = useState("");
  const [svcRate, setSvcRate] = useState("");
  const [addingSvc, setAddingSvc] = useState(false);
  const [newSvcId, setNewSvcId] = useState("");
  const [newSvcRate, setNewSvcRate] = useState("");
  const [newSvcQty, setNewSvcQty] = useState("1");
  const [newSvcBHrs, setNewSvcBHrs] = useState("0");

  // product tab state
  const [addingProduct, setAddingProduct] = useState(false);
  const [newProductId, setNewProductId] = useState("");
  const [newProductQty, setNewProductQty] = useState("1");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductQty, setEditProductQty] = useState("");
  const [editProductPrice, setEditProductPrice] = useState("");

  const autoGeneratedRef = useRef(false);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase as any).from("profiles").select("name").eq("id", user.id).single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCurrentUserName((profile as any)?.name ?? user.email ?? null);
    })();
  }, []);

  // schedule picker: track the selected schedule ID for display (separate from the formatted string stored in edits)
  const [selectedSchedId, setSelectedSchedId] = useState<string>("__none__");
  // new-schedule inline form state
  const [newSchedFreq, setNewSchedFreq] = useState<"weekly" | "bi_weekly">("weekly");
  const [newSchedDay, setNewSchedDay] = useState<string>("Mon");
  const [newSchedPattern, setNewSchedPattern] = useState<"even" | "odd">("even");
  const [creatingSchedule, setCreatingSchedule] = useState(false);

  // Auto-create a single visit for one-time jobs when none exist yet.
  // Recurring/package jobs use the explicit "Generate Visits" button instead —
  // auto-triggering those caused race conditions where both the effect and the
  // button fired concurrently, inserting duplicate visits.
  useEffect(() => {
    if (!job || autoGeneratedRef.current || visitsLoading) return;
    if (job.jobType !== "one_time" || !job.scheduledDate || visits.length > 0) return;

    autoGeneratedRef.current = true;
    void (async () => {
      try {
        await createVisit.mutateAsync({
          jobId: job.id,
          clientId: job.clientId,
          scheduledDate: job.scheduledDate!,
          crewId: job.crewId ?? null,
        });
        await qc.invalidateQueries({ queryKey: ['crm-job-visits', 'job', job.id] });
      } catch { /* silent */ }
    })();
  }, [job, visits, visitsLoading]);

  function patch(key: string, val: unknown) {
    setEdits((p) => ({ ...p, [key]: val }));
  }

  async function handleSave() {
    if (!job || Object.keys(edits).length === 0) return;
    setSaving(true);
    try {
      await updateJob.mutateAsync({ id: job.id, patch: edits });

      // Propagate crew change to all future scheduled visits
      if ("crew_id" in edits) {
        const today = new Date().toISOString().slice(0, 10);
        await fetch(`/api/crm/jobs/${job.id}/propagate-crew`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crewId: edits.crew_id ?? null, fromDate: today }),
        });
        await qc.invalidateQueries({ queryKey: ['crm-job-visits', 'job', job.id] });
        await qc.invalidateQueries({ queryKey: ['crm-job-visits'] });
      }

      setEdits({});
      setEditing(false);
      toast.success("Job saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(status: string) {
    if (!job) return;
    try {
      await updateStatus.mutateAsync({ id: job.id, status, scheduledDate: job.scheduledDate ?? "" });
      toast.success(`Marked ${STATUS_LABEL[status] ?? status}`);
      // Auto-create a draft invoice when a one-time job is completed
      if (status === "completed" && job.jobType === "one_time") {
        try {
          const today = new Date().toISOString().slice(0, 10);
          const svcs = job.services ?? [];
          const subtotal = svcs.reduce((s, sv) => s + (sv.rateCents ?? 0) * (sv.qty ?? 1), 0) || (job.rateCents ?? 0);
          await createInvoice.mutateAsync({
            jobId: job.id,
            clientId: job.clientId,
            description: `Service: ${svcs.map((s) => s.serviceName).join(", ") || "Job"}`,
            invoiceDate: today,
            lineItems: svcs.length > 0
              ? svcs.map((s) => ({ description: s.serviceName || "Service", qty: s.qty ?? 1, rateCents: s.rateCents ?? 0, totalCents: (s.rateCents ?? 0) * (s.qty ?? 1) }))
              : [{ description: "Service", qty: 1, rateCents: job.rateCents ?? 0, totalCents: job.rateCents ?? 0 }],
            subtotalCents: subtotal,
            taxRateBps: 0,
            taxCents: 0,
            totalCents: subtotal,
          });
          toast.success("Invoice created automatically — check Accounting");
        } catch { /* non-fatal */ }
      }
    } catch {
      toast.error("Failed to update status");
    }
  }

  async function handleAddVisit() {
    if (!job || !newVisitDate) return;
    try {
      await createVisit.mutateAsync({
        jobId: job.id,
        clientId: job.clientId,
        scheduledDate: newVisitDate,
        crewId: newVisitCrew || null,
        invoiceDescription: newVisitInvoiceDesc || null,
      });
      setAddingVisit(false);
      setNewVisitInvoiceDesc("");
      toast.success("Visit scheduled");
    } catch {
      toast.error("Failed to add visit");
    }
  }

  async function handleGenerateVisits() {
    if (!job) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/crm/jobs/generate-visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, lookaheadDays: 365 }),
      });
      const data = await res.json() as { generated: number; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? data.message ?? "Failed");
      await qc.invalidateQueries({ queryKey: ['crm-job-visits', 'job', job.id] });
      toast.success(
        data.generated > 0
          ? `${data.generated} visit${data.generated !== 1 ? "s" : ""} scheduled`
          : "Visits already up to date"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate visits");
    } finally {
      setGenerating(false);
    }
  }

  function startEditSvc(s: { id: string; qty: number | null; rateCents: number | null }) {
    setEditingSvcId(s.id);
    setSvcQty(String(s.qty ?? 1));
    setSvcRate(s.rateCents != null ? String(s.rateCents / 100) : "");
  }

  async function saveEditSvc() {
    if (!editingSvcId) return;
    try {
      await updateJobService.mutateAsync({
        id: editingSvcId,
        patch: {
          qty: parseFloat(svcQty) || 1,
          rate_cents: svcRate ? Math.round(parseFloat(svcRate) * 100) : null,
        },
      });
      setEditingSvcId(null);
      toast.success("Service updated");
    } catch {
      toast.error("Failed to update service");
    }
  }

  async function handleAddSvc() {
    if (!job || !newSvcId) return;
    const svc = crmServices.find((s) => s.id === newSvcId);
    if (!svc) return;
    try {
      await addJobService.mutateAsync({
        jobId: job.id,
        clientId: job.clientId,
        serviceName: svc.name,
        qty: parseFloat(newSvcQty) || 1,
        rateCents: newSvcRate ? Math.round(parseFloat(newSvcRate) * 100) : (svc.defaultRateCents ?? null),
        budgetedHours: parseFloat(newSvcBHrs) || 0,
      });
      setAddingSvc(false);
      setNewSvcId("");
      setNewSvcRate("");
      setNewSvcQty("1");
      setNewSvcBHrs("0");
      toast.success("Service added");
    } catch {
      toast.error("Failed to add service");
    }
  }

  async function handleDeleteSvc(id: string) {
    try {
      await deleteJobService.mutateAsync({ id });
      toast.success("Service removed");
    } catch {
      toast.error("Failed to remove service");
    }
  }

  async function handleInvoice() {
    if (!job) return;
    setInvoicing(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const services = job.services ?? [];
      const subtotal = services.reduce((s, sv) => s + (sv.rateCents ?? 0), 0) || (job.rateCents ?? 0);
      const invoice = await createInvoice.mutateAsync({
        jobId: job.id,
        clientId: job.clientId,
        description: `Service: ${services.map((s) => s.serviceName).join(", ") || "Job"}`,
        invoiceDate: today,
        lineItems: services.length > 0
          ? services.map((s) => ({
              description: s.serviceName || "Service",
              qty: s.qty ?? 1,
              rateCents: s.rateCents ?? 0,
              totalCents: (s.rateCents ?? 0) * (s.qty ?? 1),
            }))
          : [{
              description: job.clientName ? `Service for ${job.clientName}` : "Service",
              qty: 1,
              rateCents: job.rateCents ?? 0,
              totalCents: job.rateCents ?? 0,
            }],
        subtotalCents: subtotal,
        taxRateBps: 0,
        taxCents: 0,
        totalCents: subtotal,
      });
      toast.success("Invoice created");
      router.push(`/crm/accounting/invoices/${invoice.id}`);
    } catch {
      toast.error("Failed to create invoice");
    } finally {
      setInvoicing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6 text-sm text-slate-500">
        {jobError ? `Error loading job: ${(jobError as Error).message}` : "Job not found."}
      </div>
    );
  }

  const services = job.services ?? [];
  const jobServiceIds = new Set(services.map((s) => s.serviceId).filter(Boolean));
  const isChemicalJob = crmServices.some((s) => jobServiceIds.has(s.id) && s.trackChemicals);
  const effectiveStatus = (edits.status as string) ?? job.status;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = job.jobType === "waiting_list"
    && job.waitingListEnd != null
    && job.waitingListEnd < today
    && job.status !== "completed"
    && job.status !== "cancelled";
  const jobValueCents = services.length > 0
    ? services.reduce((s, sv) => s + (sv.rateCents ?? 0) * (sv.qty ?? 1), 0)
    : (job.rateCents ?? 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── top bar ── */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              {job.clientName ?? "Job"}
              <span className="ml-2">
                <Badge className={cn("text-[10px]", STATUS_COLOR[effectiveStatus] ?? "bg-slate-100 text-slate-500")}>
                  {STATUS_LABEL[effectiveStatus] ?? effectiveStatus}
                </Badge>
              </span>
              {isOverdue && (
                <span className="ml-1">
                  <Badge className="text-[10px] bg-red-100 text-red-700">Overdue</Badge>
                </span>
              )}
              <span className="ml-2 text-sm font-normal text-slate-400">
                {JOB_TYPE_LABEL[job.jobType] ?? job.jobType}
              </span>
            </h1>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              {job.scheduledDate
                ? new Date(job.scheduledDate + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long", month: "long", day: "numeric", year: "numeric",
                  })
                : job.schedule ?? job.recurrenceRule ?? "Not scheduled"
              }
              {job.recurrenceRule && (
                <span className="flex items-center gap-1 text-brand-600 font-medium">
                  <Repeat className="h-3 w-3" />
                  {job.recurrenceRule}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {job.jobType === "waiting_list" && (
            <Button variant="outline" size="sm" className="h-8 text-xs"
              onClick={() => { setTab("visits"); setAddingVisit(true); }}>
              <CalendarPlus className="mr-1 h-3.5 w-3.5 text-brand-500" />
              Schedule Visit
            </Button>
          )}
          {effectiveStatus !== "completed" && job.jobType !== "recurring" && job.jobType !== "package" && (
            <Button variant="outline" size="sm" className="h-8 text-xs"
              onClick={() => handleStatus("completed")}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-green-500" />
              Complete
            </Button>
          )}
          {effectiveStatus !== "cancelled" && !editing && (
            <Button variant="outline" size="sm" className="h-8 text-xs"
              onClick={() => handleStatus("cancelled")}>
              <XCircle className="mr-1 h-3.5 w-3.5 text-red-400" />
              Cancel Job
            </Button>
          )}
          {job.jobType !== "recurring" && job.jobType !== "package" && (
            <Button variant="outline" size="sm" className="h-8 text-xs"
              disabled={invoicing}
              onClick={handleInvoice}>
              <Receipt className="mr-1 h-3.5 w-3.5 text-teal-500" />
              {invoicing ? "Creating…" : "Invoice"}
            </Button>
          )}
          <div className="ml-1 h-5 w-px bg-slate-200" />
          {editing ? (
            <>
              <Button size="sm" className="h-8 text-xs"
                disabled={saving || Object.keys(edits).length === 0}
                onClick={handleSave}>
                <Save className="mr-1 h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => { setEditing(false); setEdits({}); setSelectedSchedId("__none__"); }}>
                Discard
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="h-8 text-xs"
              onClick={() => {
                // Pre-select the schedule that matches the current job schedule string
                const match = schedules.find((s) => s.name === job.recurrenceRule || s.name === job.schedule);
                setSelectedSchedId(match?.id ?? "__none__");
                setEditing(true);
              }}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit Job
            </Button>
          )}
        </div>
      </div>

      {/* ── tabs ── */}
      <div className="flex gap-0 border-b bg-white px-6">
        {(["overview", "services", "visits", "notes", "invoice", "costing", "audit"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm capitalize transition-colors border-b-2",
              tab === t
                ? "border-brand-500 text-brand-600 font-medium"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {t === "visits" ? `Visits (${visits.length})`
              : t === "audit" ? "Audit Trail"
              : t === "invoice" ? "Invoice Desc"
              : t === "costing" ? "Job Costing"
              : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── body ── */}
      <div className="flex flex-1 gap-4 overflow-auto p-6">

        {/* ── left column ── */}
        <div className="flex flex-1 flex-col gap-4 min-w-0">

          {tab === "overview" && (
            <div className="grid grid-cols-2 gap-4">
              {/* Client card */}
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Client</p>
                <p className="font-semibold text-slate-800">{job.clientName ?? "—"}</p>
                {job.serviceAddress && (
                  <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                    {job.serviceAddress}{job.serviceCity ? `, ${job.serviceCity}` : ""}{job.serviceState ? `, ${job.serviceState}` : ""} {job.serviceZip ?? ""}
                  </p>
                )}
                {job.clientPhone && (
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <Phone className="h-3 w-3" />{job.clientPhone}
                  </p>
                )}
              </div>

              {/* Job settings */}
              <div className={cn("rounded-lg border bg-white p-4 shadow-sm flex flex-col gap-3", editing && "ring-2 ring-brand-400")}>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Job Settings</p>
                  {editing
                    ? <span className="text-[10px] text-brand-600 font-medium">Editing — save when done</span>
                    : <button onClick={() => { const match = schedules.find((s) => s.name === job.recurrenceRule || s.name === job.schedule); setSelectedSchedId(match?.id ?? "__none__"); setEditing(true); }} className="text-[10px] text-slate-400 hover:text-brand-600 flex items-center gap-0.5"><Pencil className="h-2.5 w-2.5" />Edit</button>
                  }
                </div>
                {editing ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-slate-500">Scheduled Date</Label>
                      <Input
                        type="date"
                        defaultValue={job.scheduledDate ?? ""}
                        onChange={(e) => patch("scheduled_date", e.target.value || null)}
                        className="text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-slate-500">Budgeted Hours</Label>
                      <Input
                        type="number"
                        step="0.25"
                        min="0"
                        defaultValue={job.budgetedHours ?? ""}
                        onChange={(e) => patch("budgeted_hours", e.target.value ? parseFloat(e.target.value) : null)}
                        className="text-sm"
                        placeholder="0.0"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-slate-500">Crew</Label>
                      <Select
                        defaultValue={job.crewId ?? "unassigned"}
                        onValueChange={(v) => patch("crew_id", v === "unassigned" ? null : v)}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {crews.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-slate-500">Status</Label>
                      <Select
                        defaultValue={job.status}
                        onValueChange={(v) => patch("status", v)}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABEL).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {job.jobType === "waiting_list" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-slate-500">Available From</Label>
                          <Input
                            type="date"
                            defaultValue={job.waitingListStart ?? ""}
                            onChange={(e) => patch("waiting_list_start", e.target.value || null)}
                            className="text-sm"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-slate-500">Available Until</Label>
                          <Input
                            type="date"
                            defaultValue={job.waitingListEnd ?? ""}
                            onChange={(e) => patch("waiting_list_end", e.target.value || null)}
                            className="text-sm"
                          />
                        </div>
                      </div>
                    )}
                    {(job.jobType === "recurring" || job.jobType === "package") && (
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-slate-500">Recurring Schedule</Label>
                        <Select
                          value={selectedSchedId}
                          onValueChange={(v) => {
                            if (v === "__new__") {
                              setCreatingSchedule(true);
                              return;
                            }
                            setSelectedSchedId(v);
                            if (v === "__none__") {
                              patch("schedule", null);
                              patch("schedule_days", []);
                              patch("recurrence_rule", null);
                            } else {
                              const sched = schedules.find((s) => s.id === v);
                              if (!sched) return;
                              const DAY_FULL: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
                              const fullDay = DAY_FULL[sched.dayOfWeek] ?? sched.dayOfWeek;
                              const schedStr = sched.frequency === "bi_weekly"
                                ? `Bi-weekly - ${fullDay}${sched.weekPattern && sched.weekPattern !== "any" ? ` - ${sched.weekPattern === "even" ? "Even" : "Odd"} Weeks` : ""}`
                                : `Weekly - ${fullDay}`;
                              patch("schedule", schedStr);
                              patch("schedule_days", [fullDay]);
                              patch("recurrence_rule", sched.name);
                            }
                          }}
                        >
                          <SelectTrigger className="text-sm"><SelectValue placeholder="No schedule set" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— No schedule —</SelectItem>
                            {schedules.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                            <SelectItem value="__new__">+ Create new schedule…</SelectItem>
                          </SelectContent>
                        </Select>
                        {creatingSchedule && (
                          <div className="mt-1 rounded-md border bg-slate-50 p-3 flex flex-col gap-2">
                            <p className="text-[11px] font-semibold text-slate-600">New Schedule</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex flex-col gap-1">
                                <Label className="text-[10px] text-slate-500">Frequency</Label>
                                <Select value={newSchedFreq} onValueChange={(v) => setNewSchedFreq(v as "weekly" | "bi_weekly")}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="weekly">Weekly</SelectItem>
                                    <SelectItem value="bi_weekly">Bi-weekly</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <Label className="text-[10px] text-slate-500">Day</Label>
                                <Select value={newSchedDay} onValueChange={setNewSchedDay}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
                                      <SelectItem key={d} value={d}>{d}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {newSchedFreq === "bi_weekly" && (
                                <div className="col-span-2 flex flex-col gap-1">
                                  <Label className="text-[10px] text-slate-500">Week Pattern</Label>
                                  <Select value={newSchedPattern} onValueChange={(v) => setNewSchedPattern(v as "even" | "odd")}>
                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="even">Even weeks</SelectItem>
                                      <SelectItem value="odd">Odd weeks</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="h-6 text-[11px] px-2" onClick={async () => {
                                const DAY_FULL: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
                                const fullDay = DAY_FULL[newSchedDay] ?? newSchedDay;
                                const schedStr = newSchedFreq === "bi_weekly"
                                  ? `Bi-weekly - ${fullDay} - ${newSchedPattern === "even" ? "Even" : "Odd"} Weeks`
                                  : `Weekly - ${fullDay}`;
                                const name = schedStr;
                                try {
                                  const newSched = await createSchedule.mutateAsync({ name, frequency: newSchedFreq, dayOfWeek: newSchedDay as never, weekPattern: newSchedFreq === "bi_weekly" ? newSchedPattern : null, anchorDate: null, seasonStart: null, seasonEnd: null });
                                  patch("schedule", schedStr);
                                  patch("schedule_days", [fullDay]);
                                  patch("recurrence_rule", name);
                                  setSelectedSchedId(newSched.id);
                                  setCreatingSchedule(false);
                                  toast.success("Schedule created");
                                } catch { toast.error("Failed to create schedule"); }
                              }}>
                                Save Schedule
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => setCreatingSchedule(false)}>Cancel</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {job.jobType === "snow" && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs text-slate-500"># Inch Trigger</Label>
                            <Input
                              type="number" min="0" step="0.5"
                              defaultValue={job.inchTrigger ?? ""}
                              onChange={(e) => patch("inch_trigger", e.target.value ? Number(e.target.value) : null)}
                              className="text-sm"
                              placeholder="e.g. 2"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs text-slate-500">Invoice Type</Label>
                            <Select
                              defaultValue={job.invoiceType ?? ""}
                              onValueChange={(v) => patch("invoice_type", v)}
                            >
                              <SelectTrigger className="text-sm"><SelectValue placeholder="Select type" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="per_event">Per Event</SelectItem>
                                <SelectItem value="per_event_per_inch">Per Event, Per Inch</SelectItem>
                                <SelectItem value="per_push_per_inch">Per Push, Per Inch</SelectItem>
                                <SelectItem value="hourly">Hourly</SelectItem>
                                <SelectItem value="monthly_flat_rate">Monthly Flat Rate</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {(((edits.invoice_type as string | undefined) ?? job.invoiceType) === "per_event_per_inch" ||
                          ((edits.invoice_type as string | undefined) ?? job.invoiceType) === "per_push_per_inch") && (
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs text-slate-500">Rate Per Inch ($)</Label>
                            <Input
                              type="number" min="0" step="0.01"
                              defaultValue={job.ratePerInchCents != null ? job.ratePerInchCents / 100 : ""}
                              onChange={(e) => patch("rate_per_inch_cents", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
                              className="text-sm"
                              placeholder="0.00"
                            />
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-slate-500">Asset Type</Label>
                          <Input
                            defaultValue={job.assetType ?? ""}
                            onChange={(e) => patch("asset_type", e.target.value || null)}
                            className="text-sm"
                            placeholder="e.g. Skid Steer"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs text-slate-500">Days Authorized</Label>
                          <div className="flex gap-1 flex-wrap">
                            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => {
                              const current = (edits.schedule_days as string[] | undefined) ?? job.scheduleDays;
                              const active = current.includes(d);
                              return (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => patch("schedule_days", active ? current.filter((x) => x !== d) : [...current, d])}
                                  className={cn(
                                    "rounded border px-2 py-0.5 text-xs transition-colors",
                                    active ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 bg-white text-slate-600"
                                  )}
                                >
                                  {d}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                    {/* Call Ahead toggle */}
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-slate-500">Call Ahead Required</Label>
                      <button
                        type="button"
                        onClick={() => patch("call_ahead", !(edits.call_ahead ?? job.callAhead))}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                          (edits.call_ahead ?? job.callAhead) ? "bg-brand-500" : "bg-slate-200"
                        )}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform",
                            (edits.call_ahead ?? job.callAhead) ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>
                  </>
                ) : (
                  <dl className="flex flex-col gap-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-xs text-slate-500">Date</dt>
                      <dd className="text-xs font-medium text-slate-800">
                        {job.scheduledDate
                          ? new Date(job.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-xs text-slate-500">Crew</dt>
                      <dd className="text-xs font-medium text-slate-800">{crews.find((c) => c.id === job.crewId)?.name ?? "Unassigned"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-xs text-slate-500">Status</dt>
                      <dd><Badge className={cn("text-[10px]", STATUS_COLOR[job.status] ?? "bg-slate-100 text-slate-500")}>{STATUS_LABEL[job.status] ?? job.status}</Badge></dd>
                    </div>
                    {job.jobType === "waiting_list" && (
                      <div className="flex justify-between">
                        <dt className="text-xs text-slate-500">Available Window</dt>
                        <dd className="text-xs font-medium text-slate-800">
                          {job.waitingListStart || job.waitingListEnd ? (
                            <>
                              {job.waitingListStart
                                ? new Date(job.waitingListStart + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                : "Any"}
                              {" – "}
                              {job.waitingListEnd
                                ? new Date(job.waitingListEnd + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                : "Any"}
                            </>
                          ) : (
                            <span className="text-slate-400 italic">No window set</span>
                          )}
                        </dd>
                      </div>
                    )}
                    {(job.jobType === "recurring" || job.jobType === "package") && (
                      <div className="flex justify-between">
                        <dt className="text-xs text-slate-500">Schedule</dt>
                        <dd className="text-xs font-medium text-slate-800 flex items-center gap-1">
                          <Repeat className="h-3 w-3 text-brand-500" />
                          {job.recurrenceRule ?? job.schedule ?? <span className="text-slate-400 italic">Not set</span>}
                        </dd>
                      </div>
                    )}
                    {job.jobType === "snow" && (
                      <>
                        <div className="flex justify-between">
                          <dt className="text-xs text-slate-500">Invoice Type</dt>
                          <dd className="text-xs font-medium text-slate-800">
                            {job.invoiceType
                              ? { per_event: "Per Event", per_event_per_inch: "Per Event, Per Inch", per_push_per_inch: "Per Push, Per Inch", hourly: "Hourly", monthly_flat_rate: "Monthly Flat Rate" }[job.invoiceType] ?? job.invoiceType
                              : <span className="text-slate-400 italic">Not set</span>}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-xs text-slate-500"># Inch Trigger</dt>
                          <dd className="text-xs font-medium text-slate-800">{job.inchTrigger != null ? `${job.inchTrigger}"` : "—"}</dd>
                        </div>
                        {(job.invoiceType === "per_event_per_inch" || job.invoiceType === "per_push_per_inch") && (
                          <div className="flex justify-between">
                            <dt className="text-xs text-slate-500">Rate Per Inch</dt>
                            <dd className="text-xs font-medium text-slate-800">{job.ratePerInchCents != null ? formatCurrency(job.ratePerInchCents) : "—"}</dd>
                          </div>
                        )}
                        {job.assetType && (
                          <div className="flex justify-between">
                            <dt className="text-xs text-slate-500">Asset Type</dt>
                            <dd className="text-xs font-medium text-slate-800">{job.assetType}</dd>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <dt className="text-xs text-slate-500">Days Authorized</dt>
                          <dd className="text-xs font-medium text-slate-800">
                            {job.scheduleDays.length > 0 ? job.scheduleDays.join(", ") : <span className="text-slate-400 italic">Any day</span>}
                          </dd>
                        </div>
                      </>
                    )}
                    {job.callAhead && (
                      <div className="flex justify-between">
                        <dt className="text-xs text-slate-500">Call Ahead</dt>
                        <dd className="text-xs font-medium text-amber-600 flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          Required
                        </dd>
                      </div>
                    )}
                    {job.notesToCrew && (
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs text-slate-500">Notes to Crew</dt>
                        <dd className="text-xs text-slate-700">{job.notesToCrew}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>

              {/* Notes to Crew — always visible when set */}
              {(job.notesToCrew || editing) && (
                <div className="rounded-lg border bg-blue-50 border-blue-200 p-4 shadow-sm col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 mb-1">Notes to Crew</p>
                  {editing ? (
                    <Textarea
                      rows={2}
                      defaultValue={job.notesToCrew ?? ""}
                      onChange={(e) => patch("notes_to_crew", e.target.value)}
                      className="text-sm resize-none bg-white"
                      placeholder="Instructions, gate codes, special conditions…"
                    />
                  ) : (
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.notesToCrew}</p>
                  )}
                </div>
              )}

              {/* Internal Notes — same field as "Internal Notes" in the Notes tab */}
              {(job.notes || editing) && (
                <div className="rounded-lg border bg-amber-50 border-amber-200 p-4 shadow-sm col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 mb-1">Internal Note <span className="font-normal normal-case text-amber-600">(also in Notes tab)</span></p>
                  {editing ? (
                    <Textarea
                      rows={3}
                      defaultValue={job.notes ?? ""}
                      onChange={(e) => patch("notes", e.target.value)}
                      className="text-sm resize-none bg-white"
                      placeholder="Internal notes visible only to office staff…"
                    />
                  ) : (
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.notes}</p>
                  )}
                </div>
              )}

              {/* Revenue summary */}
              <div className="rounded-lg border bg-white p-4 shadow-sm col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Revenue</p>
                <div className="flex items-center gap-8 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Job Value</p>
                    <p className="text-xl font-bold text-slate-800">{formatCurrency(jobValueCents)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Budgeted Hrs</p>
                    <p className="text-xl font-bold text-slate-800">{job.budgetedHours?.toFixed(1) ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Actual Hrs</p>
                    <p className="text-xl font-bold text-slate-800">
                      {visits.filter((v) => v.actualHours).reduce((s, v) => s + (v.actualHours ?? 0), 0).toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Visits Completed</p>
                    <p className="text-xl font-bold text-slate-800">
                      {visits.filter((v) => v.status === "completed").length} / {visits.length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "services" && (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Service</th>
                      <th className="px-4 py-3 text-right">QTY</th>
                      <th className="px-4 py-3 text-right">Rate</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {services.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">
                          No services on this job.
                        </td>
                      </tr>
                    )}
                    {services.map((s) => (
                      <tr key={s.id} className="group border-b last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-800">{s.serviceName}</td>
                        {editingSvcId === s.id ? (
                          <>
                            <td className="px-2 py-2 text-right">
                              <Input
                                type="number"
                                value={svcQty}
                                onChange={(e) => setSvcQty(e.target.value)}
                                className="h-7 w-20 text-right text-sm ml-auto"
                              />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <Input
                                type="number"
                                step="0.01"
                                value={svcRate}
                                onChange={(e) => setSvcRate(e.target.value)}
                                placeholder="0.00"
                                className="h-7 w-24 text-right text-sm ml-auto"
                              />
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                              {svcRate ? formatCurrency(Math.round(parseFloat(svcRate) * 100) * (parseFloat(svcQty) || 1)) : "—"}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex justify-end gap-1">
                                <button onClick={() => void saveEditSvc()} className="rounded p-1 hover:bg-green-50 text-green-600">
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setEditingSvcId(null)} className="rounded p-1 hover:bg-slate-100 text-slate-400">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-right tabular-nums">{s.qty ?? 1}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {s.rateCents != null ? formatCurrency(s.rateCents) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold">
                              {s.rateCents != null ? formatCurrency((s.rateCents ?? 0) * (s.qty ?? 1)) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                                <button
                                  onClick={() => startEditSvc(s)}
                                  className="rounded p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => void handleDeleteSvc(s.id)}
                                  className="rounded p-1 hover:bg-red-50 text-slate-400 hover:text-red-500"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {/* Add-service inline row */}
                    {addingSvc && (
                      <tr className="border-t bg-slate-50">
                        <td className="px-2 py-2">
                          <Select value={newSvcId} onValueChange={(v) => {
                            const svc = crmServices.find((s) => s.id === v);
                            setNewSvcId(v);
                            if (svc) {
                              setNewSvcRate(svc.defaultRateCents != null ? String(svc.defaultRateCents / 100) : "");
                              setNewSvcBHrs(svc.defaultBHrs != null ? String(svc.defaultBHrs) : "0");
                            }
                          }}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select service…" /></SelectTrigger>
                            <SelectContent>
                              {crmServices.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Input type="number" min="0" step="0.01" value={newSvcQty}
                            onChange={(e) => setNewSvcQty(e.target.value)}
                            className="h-7 w-20 text-right text-xs ml-auto" />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Input type="number" min="0" step="0.01" value={newSvcRate}
                            onChange={(e) => setNewSvcRate(e.target.value)}
                            placeholder="0.00"
                            className="h-7 w-24 text-right text-xs ml-auto" />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-xs text-slate-500">
                          {newSvcRate && newSvcQty
                            ? formatCurrency(Math.round(parseFloat(newSvcRate) * 100) * (parseFloat(newSvcQty) || 1))
                            : "—"}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => void handleAddSvc()} className="rounded p-1 hover:bg-green-50 text-green-600">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setAddingSvc(false)} className="rounded p-1 hover:bg-slate-100 text-slate-400">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {services.length > 0 && (
                    <tfoot>
                      <tr className="border-t bg-slate-50">
                        <td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Total</td>
                        <td className="px-4 py-2 text-right font-bold text-slate-800">
                          {formatCurrency(services.reduce((s, sv) => s + (sv.rateCents ?? 0) * (sv.qty ?? 1), 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {!addingSvc && (
                <div>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => { setAddingSvc(true); setNewSvcId(""); setNewSvcRate(""); setNewSvcQty("1"); setNewSvcBHrs("0"); }}>
                    <Plus className="mr-1 h-3 w-3" /> Add Service
                  </Button>
                </div>
              )}

              {/* ── Products (materials) ── */}
              <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
                <div className="bg-slate-50 border-b px-4 py-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Products</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Product</th>
                      <th className="px-4 py-3 text-right">QTY</th>
                      <th className="px-4 py-3 text-right">Unit Price</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {jobProducts.length === 0 && !addingProduct && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">
                          No products on this job yet.
                        </td>
                      </tr>
                    )}
                    {jobProducts.map((p) => (
                      <tr key={p.id} className="group border-b last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-800">{p.productName}</td>
                        {editingProductId === p.id ? (
                          <>
                            <td className="px-2 py-2 text-right">
                              <Input type="number" min="0" step="0.01" value={editProductQty}
                                onChange={(e) => setEditProductQty(e.target.value)}
                                className="h-7 w-20 text-right text-sm ml-auto" />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <Input type="number" min="0" step="0.01" value={editProductPrice}
                                onChange={(e) => setEditProductPrice(e.target.value)}
                                placeholder="0.00"
                                className="h-7 w-24 text-right text-sm ml-auto" />
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                              {editProductPrice && editProductQty
                                ? formatCurrency(Math.round(parseFloat(editProductPrice) * 100) * (parseFloat(editProductQty) || 1))
                                : "—"}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex justify-end gap-1">
                                <button onClick={async () => {
                                  if (!job) return;
                                  try {
                                    await updateJobProduct.mutateAsync({
                                      id: p.id, jobId: job.id,
                                      qty: parseFloat(editProductQty) || 1,
                                      unitPriceCents: editProductPrice ? Math.round(parseFloat(editProductPrice) * 100) : 0,
                                    });
                                    setEditingProductId(null);
                                    toast.success("Product updated");
                                  } catch { toast.error("Failed to update product"); }
                                }} className="rounded p-1 hover:bg-green-50 text-green-600">
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setEditingProductId(null)} className="rounded p-1 hover:bg-slate-100 text-slate-400">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-right tabular-nums">{p.qty}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(p.unitPriceCents)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(p.unitPriceCents * p.qty)}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                                <button onClick={() => {
                                  setEditingProductId(p.id);
                                  setEditProductQty(String(p.qty));
                                  setEditProductPrice(String(p.unitPriceCents / 100));
                                }} className="rounded p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={async () => {
                                  if (!job) return;
                                  try {
                                    await deleteJobProduct.mutateAsync({ id: p.id, jobId: job.id });
                                    toast.success("Product removed");
                                  } catch { toast.error("Failed to remove product"); }
                                }} className="rounded p-1 hover:bg-red-50 text-slate-400 hover:text-red-500">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {addingProduct && (
                      <tr className="border-t bg-slate-50">
                        <td className="px-2 py-2">
                          <Select value={newProductId} onValueChange={(v) => {
                            const prod = productCatalog.find((p) => p.id === v);
                            setNewProductId(v);
                            if (prod) setNewProductPrice(String(prod.price / 100));
                          }}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select product…" /></SelectTrigger>
                            <SelectContent>
                              {productCatalog
                                .filter((p) => p.category === "stocked_material" || p.category === "project_material")
                                .map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Input type="number" min="0" step="0.01" value={newProductQty}
                            onChange={(e) => setNewProductQty(e.target.value)}
                            className="h-7 w-20 text-right text-xs ml-auto" />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Input type="number" min="0" step="0.01" value={newProductPrice}
                            onChange={(e) => setNewProductPrice(e.target.value)}
                            placeholder="0.00"
                            className="h-7 w-24 text-right text-xs ml-auto" />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-xs text-slate-500">
                          {newProductPrice && newProductQty
                            ? formatCurrency(Math.round(parseFloat(newProductPrice) * 100) * (parseFloat(newProductQty) || 1))
                            : "—"}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex justify-end gap-1">
                            <button onClick={async () => {
                              if (!job || !newProductId) return;
                              const prod = productCatalog.find((p) => p.id === newProductId);
                              if (!prod) return;
                              try {
                                await addJobProduct.mutateAsync({
                                  jobId: job.id,
                                  productId: prod.id,
                                  productName: prod.name,
                                  qty: parseFloat(newProductQty) || 1,
                                  unitPriceCents: newProductPrice ? Math.round(parseFloat(newProductPrice) * 100) : prod.price,
                                  unitCostCents: prod.unitCost ?? null,
                                });
                                setAddingProduct(false);
                                setNewProductId(""); setNewProductPrice(""); setNewProductQty("1");
                                toast.success("Product added");
                              } catch { toast.error("Failed to add product"); }
                            }} className="rounded p-1 hover:bg-green-50 text-green-600">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setAddingProduct(false)} className="rounded p-1 hover:bg-slate-100 text-slate-400">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {jobProducts.length > 0 && (
                    <tfoot>
                      <tr className="border-t bg-slate-50">
                        <td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Total</td>
                        <td className="px-4 py-2 text-right font-bold text-slate-800">
                          {formatCurrency(jobProducts.reduce((s, p) => s + p.unitPriceCents * p.qty, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {!addingProduct && (
                <div>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => { setAddingProduct(true); setNewProductId(""); setNewProductPrice(""); setNewProductQty("1"); }}>
                    <Plus className="mr-1 h-3 w-3" /> Add Product
                  </Button>
                </div>
              )}
            </div>
          )}

          {tab === "visits" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">{visits.length} visit{visits.length !== 1 ? "s" : ""}</p>
                <div className="flex items-center gap-2">
                  {/* Manual generate button for recurring/package jobs */}
                  {(job.jobType === "recurring" || job.jobType === "package") && (
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleGenerateVisits} disabled={generating}>
                      {generating ? "Generating…" : "Generate Visits"}
                    </Button>
                  )}
                  {/* Bulk-delete by day of week — useful when a schedule changes */}
                  {visits.length > 0 && (() => {
                    const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
                    const dayCounts = visits
                      .filter((v) => v.status === "scheduled" && v.scheduledDate)
                      .reduce<Record<number, number>>((acc, v) => {
                        const d = new Date(v.scheduledDate! + "T00:00:00").getDay();
                        acc[d] = (acc[d] ?? 0) + 1;
                        return acc;
                      }, {});
                    const days = Object.entries(dayCounts).map(([d, n]) => ({ day: parseInt(d), name: DAY_NAMES[parseInt(d)]!, count: n }));
                    if (days.length < 2) return null;
                    return (
                      <Select
                        value=""
                        onValueChange={async (v) => {
                          const day = parseInt(v);
                          const entry = days.find((d) => d.day === day);
                          if (!entry) return;
                          if (!confirm(`Remove all ${entry.count} scheduled ${entry.name} visits? This cannot be undone.`)) return;
                          const removed = await deleteVisitsByDay.mutateAsync({ jobId: job.id, dayOfWeek: day });
                          toast.success(`Removed ${removed} ${entry.name} visits`);
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs w-auto gap-1 border-red-200 text-red-600 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                          <SelectValue placeholder="Remove day…" />
                        </SelectTrigger>
                        <SelectContent>
                          {days.map(({ day, name, count }) => (
                            <SelectItem key={day} value={String(day)} className="text-red-600 text-xs">
                              Remove all {name} visits ({count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                  <Button size="sm" variant="outline" onClick={() => setAddingBulkNote(true)}>
                    Note All Visits
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAddingVisit(true)}>
                    <CalendarPlus className="mr-1.5 h-4 w-4" />
                    Schedule Visit
                  </Button>
                </div>
              </div>

              {addingBulkNote && (
                <div className="rounded-lg border bg-amber-50 border-amber-200 p-4 flex flex-col gap-2">
                  <p className="text-xs font-semibold text-amber-800">Add note to all {visits.filter(v => v.status === "scheduled").length} scheduled visits</p>
                  <Textarea
                    rows={2}
                    value={bulkNote}
                    onChange={(e) => setBulkNote(e.target.value)}
                    placeholder="Note to crew for all upcoming visits…"
                    className="text-sm resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!bulkNote.trim()} onClick={async () => {
                      const scheduled = visits.filter(v => v.status === "scheduled");
                      await Promise.all(scheduled.map(v =>
                        updateVisit.mutateAsync({ id: v.id, updates: { notes_to_crew: bulkNote.trim() } })
                      ));
                      setBulkNote("");
                      setAddingBulkNote(false);
                      toast.success(`Note added to ${scheduled.length} visits`);
                    }}>
                      Save to All
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setBulkNote(""); setAddingBulkNote(false); }}>Cancel</Button>
                  </div>
                </div>
              )}

              {addingVisit && (
                <div className="rounded-lg border bg-blue-50 border-blue-200 p-4 flex items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-slate-600">Date</Label>
                    <Input
                      type="date"
                      value={newVisitDate}
                      onChange={(e) => setNewVisitDate(e.target.value)}
                      className="text-sm w-40"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-slate-600">Crew</Label>
                    <Select value={newVisitCrew} onValueChange={setNewVisitCrew}>
                      <SelectTrigger className="text-sm w-44">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unassigned__">Unassigned</SelectItem>
                        {crews.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" onClick={handleAddVisit} disabled={createVisit.isPending}>
                    {createVisit.isPending ? "Adding…" : "Add Visit"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddingVisit(false)}>Cancel</Button>
                </div>
              )}

              <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Crew</th>
                      <th className="px-4 py-3 text-right">Actual Hrs</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-left">Notes</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {visits.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">
                          No visits yet. Schedule one above.
                        </td>
                      </tr>
                    )}
                    {visits.map((v) => (
                      <VisitRow key={v.id} visit={v}
                        jobId={job.id}
                        propertyId={job.propertyId}
                        isChemicalJob={isChemicalJob}
                        onDelete={async () => {
                          if (!confirm("Delete this visit?")) return;
                          await deleteVisit.mutateAsync(v.id);
                          toast.success("Visit deleted");
                        }}
                        onSaveNote={async (note) => {
                          await updateVisit.mutateAsync({ id: v.id, updates: { notes_to_crew: note || null } });
                          toast.success("Note saved");
                        }}
                        onSaveInvoiceDesc={async (desc) => {
                          await updateVisit.mutateAsync({ id: v.id, updates: { invoice_description: desc || null } });
                          toast.success("Invoice description saved");
                        }}
                        onSkip={async (reason) => {
                          await updateVisit.mutateAsync({ id: v.id, updates: { status: "skipped", completion_notes: reason || null } });
                          toast.success("Visit skipped");
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "notes" && (
            <div className="rounded-lg border bg-white p-4 shadow-sm flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-slate-600">Notes to Crew</Label>
                <Textarea
                  rows={4}
                  defaultValue={job.notesToCrew ?? ""}
                  onChange={(e) => patch("notes_to_crew", e.target.value)}
                  className="text-sm resize-none"
                  placeholder="Instructions, access codes, special conditions…"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-slate-600">Internal Notes</Label>
                <Textarea
                  rows={4}
                  defaultValue={job.notes ?? ""}
                  onChange={(e) => patch("notes", e.target.value)}
                  className="text-sm resize-none"
                  placeholder="Internal notes visible only to office staff…"
                />
              </div>
              <div className="flex justify-end">
                <Button size="sm" disabled={saving || Object.keys(edits).length === 0} onClick={handleSave}>
                  <Save className="mr-1 h-3.5 w-3.5" />
                  {saving ? "Saving…" : "Save Notes"}
                </Button>
              </div>
            </div>
          )}
          {tab === "invoice" && (
            <div className="rounded-lg border bg-white p-4 shadow-sm flex flex-col gap-3">
              <div>
                <Label className="text-xs font-medium text-slate-600 mb-1 block">Invoice Description</Label>
                <p className="text-xs text-slate-500 mb-2">
                  This master description appears on all invoices generated for this job. Leave blank to use the default service name(s).
                </p>
                <Textarea
                  rows={6}
                  defaultValue={job.invoiceDescription ?? ""}
                  onChange={(e) => patch("invoice_description", e.target.value)}
                  className="text-sm resize-none"
                  placeholder="e.g. Weekly lawn maintenance — mow, trim, blow…"
                />
              </div>
              <div className="flex justify-end">
                <Button size="sm" disabled={saving || Object.keys(edits).length === 0} onClick={handleSave}>
                  <Save className="mr-1 h-3.5 w-3.5" />
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
          {tab === "costing" && (
            <JobCostingTab jobId={job.id} estimateId={job.estimateId ?? null} />
          )}

          {tab === "audit" && (() => {
            // Build a timeline from available timestamps — no separate activity table needed
            type AuditEntry = { ts: string; label: string; sub?: string; color: string };
            const entries: AuditEntry[] = [];

            if (job.createdAt) {
              entries.push({ ts: job.createdAt, label: "Job created", sub: `Type: ${JOB_TYPE_LABEL[job.jobType] ?? job.jobType}${currentUserName ? ` · by ${currentUserName}` : ""}`, color: "bg-slate-400" });
            }

            // Status change events — inferred from current status + updatedAt
            // updatedAt reflects the last modification; if status is terminal, that's when it changed
            const terminalStatuses: Record<string, { label: string; color: string }> = {
              completed:  { label: "Job marked complete", color: "bg-green-500" },
              cancelled:  { label: "Job cancelled",       color: "bg-red-400" },
              hold:       { label: "Job put on hold",     color: "bg-orange-400" },
            };
            if (job.status && terminalStatuses[job.status] && job.updatedAt && job.updatedAt !== job.createdAt) {
              const { label, color } = terminalStatuses[job.status];
              entries.push({ ts: job.updatedAt, label, color });
            }

            visits.forEach((v) => {
              const date = v.scheduledDate
                ? new Date(v.scheduledDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                : "unknown date";
              if (v.createdAt) {
                entries.push({ ts: v.createdAt, label: `Visit scheduled — ${date}`, sub: v.crewName ? `Crew: ${v.crewName}` : undefined, color: "bg-blue-400" });
              }
              if (v.dispatchedAt) {
                entries.push({ ts: v.dispatchedAt, label: `Visit dispatched — ${date}`, color: "bg-orange-400" });
              }
              if (v.completedAt) {
                entries.push({ ts: v.completedAt, label: `Visit completed — ${date}`, sub: v.actualHours ? `${v.actualHours}h logged` : undefined, color: "bg-green-500" });
              }
              if (v.status === "skipped" && v.updatedAt && v.completionNotes) {
                entries.push({ ts: v.updatedAt, label: `Visit skipped — ${date}`, sub: `Reason: ${v.completionNotes}`, color: "bg-slate-400" });
              } else if (v.status === "skipped" && v.updatedAt) {
                entries.push({ ts: v.updatedAt, label: `Visit skipped — ${date}`, color: "bg-slate-400" });
              }
            });

            entries.sort((a, b) => b.ts.localeCompare(a.ts));

            function fmtTs(ts: string) {
              return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
            }

            return (
              <div className="rounded-lg border bg-white shadow-sm p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Activity — most recent first</p>
                {entries.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No activity recorded yet.</p>
                ) : (
                  <div className="flex flex-col gap-0">
                    {entries.map((e, i) => (
                      <div key={i} className="flex gap-3 pb-4 relative">
                        <div className="flex flex-col items-center">
                          <div className={cn("h-2.5 w-2.5 rounded-full mt-1 shrink-0", e.color)} />
                          {i < entries.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800">{e.label}</p>
                          {e.sub && <p className="text-xs text-slate-500">{e.sub}</p>}
                          <p className="text-[11px] text-slate-400 mt-0.5">{fmtTs(e.ts)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

        </div>

        {/* ── right sidebar ── */}
        <div className="w-64 shrink-0 flex flex-col gap-3">
          <div className="rounded-lg border bg-white p-4 shadow-sm text-xs flex flex-col gap-2">
            <p className="font-semibold text-slate-500 text-[10px] uppercase tracking-wide">Job Info</p>
            <InfoRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Type" value={JOB_TYPE_LABEL[job.jobType] ?? job.jobType} />
            <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Crew" value={job.crewName ?? "Unassigned"} />
            <InfoRow icon={<Clock className="h-3.5 w-3.5" />} label="Budgeted" value={job.budgetedHours ? `${job.budgetedHours}h` : "—"} />
            <InfoRow icon={<Receipt className="h-3.5 w-3.5" />} label="Revenue" value={formatCurrency(jobValueCents)} />
            {job.source && <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Source" value={job.source} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function VisitRow({
  visit,
  jobId,
  propertyId,
  isChemicalJob,
  onDelete,
  onSaveNote,
  onSaveInvoiceDesc,
  onSkip,
}: {
  visit: CRMJobVisit;
  jobId: string;
  propertyId: string | null;
  isChemicalJob: boolean;
  onDelete: () => void;
  onSaveNote: (note: string) => Promise<void>;
  onSaveInvoiceDesc: (desc: string) => Promise<void>;
  onSkip: (reason: string) => Promise<void>;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteVal, setNoteVal] = useState(visit.notesToCrew ?? "");
  const [editingInvoiceDesc, setEditingInvoiceDesc] = useState(false);
  const [invoiceDescVal, setInvoiceDescVal] = useState(visit.invoiceDescription ?? "");
  const [skipping, setSkipping] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [showChemicals, setShowChemicals] = useState(false);

  const isTerminal = visit.status === "completed" || visit.status === "skipped" || visit.status === "cancelled";

  return (
    <>
      <tr className="group border-b last:border-0 hover:bg-slate-50">
        <td className="px-4 py-3 text-slate-700">
          {visit.scheduledDate
            ? new Date(visit.scheduledDate + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric",
              })
            : "—"}
        </td>
        <td className="px-4 py-3 text-slate-600">{visit.crewName ?? <span className="italic text-slate-400">Unassigned</span>}</td>
        <td className="px-4 py-3 text-right tabular-nums">{visit.actualHours?.toFixed(1) ?? "—"}</td>
        <td className="px-4 py-3 text-center">
          <Badge className={cn("text-[10px]", VISIT_STATUS_COLOR[visit.status] ?? "bg-slate-50 text-slate-500")}>
            {visit.status}
          </Badge>
        </td>
        <td className="px-4 py-3 text-xs max-w-xs">
          <div className="flex flex-col gap-0.5">
            {visit.notesToCrew ? (
              <button onClick={() => { setEditingNote(true); setEditingInvoiceDesc(false); }} className="text-slate-600 hover:text-brand-600 text-left truncate max-w-[200px] block">
                {visit.notesToCrew}
              </button>
            ) : (
              <button onClick={() => { setEditingNote(true); setEditingInvoiceDesc(false); }} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-brand-500 italic">
                + crew note
              </button>
            )}
            {visit.invoiceDescription ? (
              <button onClick={() => { setEditingInvoiceDesc(true); setEditingNote(false); }} className="text-indigo-600 hover:text-indigo-700 text-left truncate max-w-[200px] block text-[11px]">
                📄 {visit.invoiceDescription}
              </button>
            ) : (
              <button onClick={() => { setEditingInvoiceDesc(true); setEditingNote(false); }} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-500 italic text-[11px]">
                + invoice desc
              </button>
            )}
          </div>
        </td>
        <td className="px-4 py-3 w-20">
          <div className="flex items-center gap-1">
            {isChemicalJob && (
              <button
                onClick={() => setShowChemicals((v) => !v)}
                title="Chemical applications"
                className={cn(
                  "rounded p-1 hover:bg-teal-50 hover:text-teal-600 transition-opacity",
                  showChemicals ? "text-teal-600" : "text-slate-300 opacity-0 group-hover:opacity-100"
                )}
              >
                <FlaskConical className="h-3.5 w-3.5" />
              </button>
            )}
            {!isTerminal && (
              <button
                onClick={() => { setSkipping(true); setEditingNote(false); }}
                title="Skip visit"
                className="rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-amber-50 text-slate-300 hover:text-amber-500"
              >
                <SkipForward className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onDelete}
              title="Delete visit"
              className="rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 text-slate-300 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {showChemicals && (
        <tr className="border-b bg-teal-50/40">
          <td colSpan={6} className="px-4 py-3">
            <ChemicalApplicationPanel jobId={jobId} visitId={visit.id} propertyId={propertyId} />
          </td>
        </tr>
      )}
      {skipping && (
        <tr className="border-b bg-amber-50">
          <td colSpan={6} className="px-4 py-2">
            <p className="text-xs font-medium text-amber-700 mb-1.5">Skip reason (optional)</p>
            <div className="flex items-end gap-2">
              <Textarea
                rows={2}
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                className="text-sm resize-none flex-1 bg-white"
                placeholder="Weather, client request, crew availability…"
                autoFocus
              />
              <div className="flex flex-col gap-1 shrink-0">
                <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" onClick={async () => {
                  await onSkip(skipReason);
                  setSkipping(false);
                  setSkipReason("");
                }}>Skip</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setSkipping(false); setSkipReason(""); }}>Cancel</Button>
              </div>
            </div>
          </td>
        </tr>
      )}
      {editingNote && (
        <tr className="border-b bg-slate-50">
          <td colSpan={6} className="px-4 py-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Note to Crew</p>
            <div className="flex items-end gap-2">
              <Textarea
                rows={2}
                value={noteVal}
                onChange={(e) => setNoteVal(e.target.value)}
                className="text-sm resize-none flex-1"
                placeholder="Note to crew for this visit…"
                autoFocus
              />
              <div className="flex flex-col gap-1 shrink-0">
                <Button size="sm" className="h-7 text-xs" onClick={async () => {
                  await onSaveNote(noteVal);
                  setEditingNote(false);
                }}>Save</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setNoteVal(visit.notesToCrew ?? ""); setEditingNote(false); }}>Cancel</Button>
              </div>
            </div>
          </td>
        </tr>
      )}
      {editingInvoiceDesc && (
        <tr className="border-b bg-indigo-50">
          <td colSpan={6} className="px-4 py-2">
            <p className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide mb-1">Invoice Description</p>
            <div className="flex items-end gap-2">
              <Input
                value={invoiceDescVal}
                onChange={(e) => setInvoiceDescVal(e.target.value)}
                className="text-sm flex-1 bg-white"
                placeholder="e.g. Mow, edge & blow — front & back"
                autoFocus
              />
              <div className="flex flex-col gap-1 shrink-0">
                <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700" onClick={async () => {
                  await onSaveInvoiceDesc(invoiceDescVal);
                  setEditingInvoiceDesc(false);
                }}>Save</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setInvoiceDescVal(visit.invoiceDescription ?? ""); setEditingInvoiceDesc(false); }}>Cancel</Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-600">
      <span className="text-slate-400">{icon}</span>
      <span className="text-slate-400 w-16">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}
