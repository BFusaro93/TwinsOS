"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useJobDetail,
  useJobVisits,
  useUpdateJob,
  useCreateVisit,
  useCRMCrews,
  useUpdateJobStatus,
} from "@/lib/hooks/use-crm-jobs";
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
  ArrowLeft,
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
} from "lucide-react";
import type { CRMJobVisit } from "@/types/crm-jobs";

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

type Tab = "overview" | "services" | "visits" | "notes";

interface Props {
  jobId: string;
}

export function JobDetail({ jobId }: Props) {
  const router = useRouter();
  const { data: job, isLoading, error: jobError } = useJobDetail(jobId);
  const { data: visits = [] } = useJobVisits(jobId);
  const { data: crews = [] } = useCRMCrews();
  const updateJob = useUpdateJob();
  const createVisit = useCreateVisit();
  const updateStatus = useUpdateJobStatus();
  const createInvoice = useCreateInvoiceFromJob();

  const [tab, setTab] = useState<Tab>("overview");
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [addingVisit, setAddingVisit] = useState(false);
  const [newVisitDate, setNewVisitDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [newVisitCrew, setNewVisitCrew] = useState("");
  const [invoicing, setInvoicing] = useState(false);
  const [generating, setGenerating] = useState(false);

  function patch(key: string, val: unknown) {
    setEdits((p) => ({ ...p, [key]: val }));
  }

  async function handleSave() {
    if (!job || Object.keys(edits).length === 0) return;
    setSaving(true);
    try {
      await updateJob.mutateAsync({ id: job.id, patch: edits });
      setEdits({});
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
      toast.success(`Marked ${STATUS_LABEL[status]}`);
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
      });
      setAddingVisit(false);
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
        body: JSON.stringify({ jobId: job.id, lookaheadDays: 14 }),
      });
      const data = await res.json() as { generated: number; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Failed");
      toast.success(
        data.generated > 0
          ? `${data.generated} visit${data.generated !== 1 ? "s" : ""} scheduled (next 14 days)`
          : "Visits already up to date"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate visits");
    } finally {
      setGenerating(false);
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
  const effectiveStatus = (edits.status as string) ?? job.status;

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── top bar ── */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              {job.clientName ?? "Job"}
              <span className="ml-2">
                <Badge className={cn("text-[10px]", STATUS_COLOR[effectiveStatus] ?? "bg-slate-100 text-slate-500")}>
                  {STATUS_LABEL[effectiveStatus] ?? effectiveStatus}
                </Badge>
              </span>
              <span className="ml-2 text-sm font-normal text-slate-400">
                {JOB_TYPE_LABEL[job.jobType] ?? job.jobType}
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              {job.scheduledDate
                ? new Date(job.scheduledDate + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long", month: "long", day: "numeric", year: "numeric",
                  })
                : "Not scheduled"
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {(job.jobType === "recurring" || job.jobType === "package") && (
            <Button variant="outline" size="sm" className="h-8 text-xs"
              disabled={generating} onClick={handleGenerateVisits}>
              <RefreshCw className={cn("mr-1 h-3.5 w-3.5 text-blue-500", generating && "animate-spin")} />
              {generating ? "Generating…" : "Generate Visits"}
            </Button>
          )}
          {effectiveStatus !== "completed" && (
            <Button variant="outline" size="sm" className="h-8 text-xs"
              onClick={() => handleStatus("completed")}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-green-500" />
              Complete
            </Button>
          )}
          {effectiveStatus !== "cancelled" && (
            <Button variant="outline" size="sm" className="h-8 text-xs"
              onClick={() => handleStatus("cancelled")}>
              <XCircle className="mr-1 h-3.5 w-3.5 text-red-400" />
              Cancel
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs"
            disabled={invoicing}
            onClick={handleInvoice}>
            <Receipt className="mr-1 h-3.5 w-3.5 text-teal-500" />
            {invoicing ? "Creating…" : "Invoice"}
          </Button>
          <div className="ml-1 h-5 w-px bg-slate-200" />
          <Button size="sm" className="h-8 text-xs" disabled={saving || Object.keys(edits).length === 0}
            onClick={handleSave}>
            <Save className="mr-1 h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* ── tabs ── */}
      <div className="flex gap-0 border-b bg-white px-6">
        {(["overview", "services", "visits", "notes"] as Tab[]).map((t) => (
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
            {t === "visits" ? `Visits (${visits.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
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
              <div className="rounded-lg border bg-white p-4 shadow-sm flex flex-col gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Job Settings</p>
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
                  <Label className="text-xs text-slate-500">Crew</Label>
                  <Select
                    defaultValue={job.crewId ?? ""}
                    onValueChange={(v) => patch("crew_id", v || null)}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Unassigned">
                        {job.crewName ?? "Unassigned"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned__">Unassigned</SelectItem>
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
              </div>

              {/* Revenue summary */}
              <div className="rounded-lg border bg-white p-4 shadow-sm col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Revenue</p>
                <div className="flex items-center gap-8 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Job Value</p>
                    <p className="text-xl font-bold text-slate-800">{formatCurrency(job.rateCents ?? 0)}</p>
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
            <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Service</th>
                    <th className="px-4 py-3 text-right">QTY</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {services.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">
                        No services on this job.
                      </td>
                    </tr>
                  )}
                  {services.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-800">{s.serviceName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.qty ?? 1}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s.rateCents != null ? formatCurrency(s.rateCents) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {s.rateCents != null ? formatCurrency((s.rateCents ?? 0) * (s.qty ?? 1)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {services.length > 0 && (
                  <tfoot>
                    <tr className="border-t bg-slate-50">
                      <td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Total</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-800">
                        {formatCurrency(services.reduce((s, sv) => s + (sv.rateCents ?? 0) * (sv.qty ?? 1), 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {tab === "visits" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">{visits.length} visit{visits.length !== 1 ? "s" : ""}</p>
                <Button size="sm" variant="outline" onClick={() => setAddingVisit(true)}>
                  <CalendarPlus className="mr-1.5 h-4 w-4" />
                  Schedule Visit
                </Button>
              </div>

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
                      <VisitRow key={v.id} visit={v} />
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
        </div>

        {/* ── right sidebar ── */}
        <div className="w-64 shrink-0 flex flex-col gap-3">
          <div className="rounded-lg border bg-white p-4 shadow-sm text-xs flex flex-col gap-2">
            <p className="font-semibold text-slate-500 text-[10px] uppercase tracking-wide">Job Info</p>
            <InfoRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Type" value={JOB_TYPE_LABEL[job.jobType] ?? job.jobType} />
            <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Crew" value={job.crewName ?? "Unassigned"} />
            <InfoRow icon={<Clock className="h-3.5 w-3.5" />} label="Budgeted" value={job.budgetedHours ? `${job.budgetedHours}h` : "—"} />
            <InfoRow icon={<Receipt className="h-3.5 w-3.5" />} label="Revenue" value={formatCurrency(job.rateCents ?? 0)} />
            {job.source && <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Source" value={job.source} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function VisitRow({ visit }: { visit: CRMJobVisit }) {
  return (
    <tr className="border-b last:border-0 hover:bg-slate-50">
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
      <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">{visit.completionNotes ?? "—"}</td>
    </tr>
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
