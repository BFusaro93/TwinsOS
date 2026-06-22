"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useVisitsForDate,
  useUpdateVisitStatus,
  useUpdateVisit,
  useCRMCrews,
} from "@/lib/hooks/use-crm-jobs";
import { useCreateInvoice } from "@/lib/hooks/use-invoices";
import { WeekStrip } from "./WeekStrip";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Calendar,
  CalendarCheck,
  Smartphone,
  CheckCircle2,
  XCircle,
  CornerDownRight,
  FileText,
  Users,
  Search,
  MapPin,
  BarChart3,
  Columns3,
  Route,
  X as XIcon,
} from "lucide-react";
import type { CRMJobVisit, VisitStatus, JobComment } from "@/types/crm-jobs";

// ── status icon ───────────────────────────────────────────────────────────────

const STATUS_CYCLE: VisitStatus[] = ["scheduled", "dispatched", "in_progress", "completed", "skipped"];

function StatusIcon({ status }: { status: VisitStatus }) {
  switch (status) {
    case "scheduled":   return <Calendar className="h-4 w-4 text-slate-400" />;
    case "dispatched":  return <Smartphone className="h-4 w-4 text-orange-400" />;
    case "in_progress": return <CalendarCheck className="h-4 w-4 text-yellow-500" />;
    case "completed":   return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "cancelled":   return <XCircle className="h-4 w-4 text-red-400" />;
    case "skipped":     return <CornerDownRight className="h-4 w-4 text-blue-400" />;
    default:            return <Calendar className="h-4 w-4 text-slate-300" />;
  }
}

function StatusCycleButton({ visit }: { visit: CRMJobVisit }) {
  const { mutateAsync: updateStatus, isPending } = useUpdateVisitStatus();

  async function cycle(e: React.MouseEvent) {
    e.stopPropagation();
    const i = STATUS_CYCLE.indexOf(visit.status);
    const next = STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
    try {
      await updateStatus({ id: visit.id, status: next });
    } catch {
      toast.error("Failed to update status");
    }
  }

  return (
    <button
      onClick={cycle}
      disabled={isPending}
      title={visit.status}
      className={cn("flex items-center justify-center rounded transition-opacity", isPending && "opacity-50")}
    >
      <StatusIcon status={visit.status} />
    </button>
  );
}

// ── job detail sheet ──────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: VisitStatus; label: string }[] = [
  { value: "scheduled",   label: "Pending" },
  { value: "dispatched",  label: "Dispatched" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed",   label: "Completed" },
  { value: "cancelled",   label: "Cancelled" },
  { value: "skipped",     label: "Skipped" },
];

const SUB_STATUS_OPTIONS = [
  "At Property", "En Route", "On Hold", "Waiting for Parts", "Needs Follow-up",
];

function JobDetailSheet({
  visit,
  open,
  onOpenChange,
  crews,
}: {
  visit: CRMJobVisit;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  crews: { id: string; name: string }[];
}) {
  const { mutateAsync: updateVisit, isPending } = useUpdateVisit();
  const router = useRouter();
  const { mutateAsync: createInvoice, isPending: invoicing } = useCreateInvoice();

  const job  = visit.job;
  const services = job?.services ?? [];
  const serviceName = services.length > 0
    ? services.map((s) => s.serviceName).join(", ")
    : "Service Visit";

  // Form state — reset when visit changes
  const [status,      setStatus]      = useState<VisitStatus>(visit.status);
  const [subStatus,   setSubStatus]   = useState(visit.subStatus ?? "");
  const [crewId,      setCrewId]      = useState(visit.crewId ?? "");
  const [startTime,   setStartTime]   = useState(visit.startTime ?? "");
  const [endTime,     setEndTime]     = useState(visit.endTime ?? "");
  const [actualHours, setActualHours] = useState(String(visit.actualHours ?? ""));
  const [menCount,    setMenCount]    = useState(String(visit.menCount));
  const [qty,         setQty]         = useState(String(visit.qty ?? ""));
  const [rateCents,   setRateCents]   = useState(
    String(visit.rateCents != null ? visit.rateCents / 100 : "")
  );

  // Notes state
  const [newComment,    setNewComment]    = useState("");
  const [notesToClient, setNotesToClient] = useState(visit.notesToClient ?? "");
  const [invoiceDesc,   setInvoiceDesc]   = useState(visit.invoiceDescription ?? "");

  const effectiveRate = visit.rateCents ?? job?.rateCents ?? null;
  const amt = visit.rateCents != null ? visit.rateCents
            : job?.rateCents ?? 0;
  const budgetedHours = job?.budgetedHours;

  async function handleSave() {
    const updates: Parameters<typeof updateVisit>[0]["updates"] = {
      status,
      sub_status: subStatus || null,
      crew_id: crewId || null,
      start_time: startTime || null,
      end_time: endTime || null,
      actual_hours: actualHours ? parseFloat(actualHours) : null,
      men_count: parseInt(menCount) || 0,
      qty: qty ? parseFloat(qty) : null,
      rate_cents: rateCents ? Math.round(parseFloat(rateCents) * 100) : null,
      notes_to_client: notesToClient || null,
      invoice_description: invoiceDesc || null,
    };
    if (status === "completed" && visit.status !== "completed") {
      updates.completed_at = new Date().toISOString();
    }
    if (status === "dispatched" && visit.status !== "dispatched") {
      updates.dispatched_at = new Date().toISOString();
    }
    try {
      await updateVisit({ id: visit.id, updates });
      toast.success("Saved");
      onOpenChange(false);
    } catch {
      toast.error("Failed to save");
    }
  }

  async function addComment() {
    if (!newComment.trim()) return;
    const comment: JobComment = {
      id: crypto.randomUUID(),
      authorName: "Me",
      authorId: "current",
      text: newComment.trim(),
      createdAt: new Date().toISOString(),
    };
    try {
      await updateVisit({
        id: visit.id,
        updates: { job_comments: [...visit.jobComments, comment] },
      });
      setNewComment("");
      toast.success("Comment added");
    } catch {
      toast.error("Failed to add comment");
    }
  }

  async function handleInvoice() {
    try {
      const invoice = await createInvoice({
        clientId: visit.clientId,
        description: serviceName,
        invoiceDate: visit.scheduledDate,
      });
      toast.success("Invoice created");
      onOpenChange(false);
      router.push(`/crm/accounting/invoices/${invoice.id}`);
    } catch {
      toast.error("Failed to create invoice");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[680px] sm:max-w-[680px] p-0 flex flex-col gap-0"
      >
        {/* Header */}
        <SheetHeader className="shrink-0 bg-slate-800 text-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-base font-bold text-white leading-tight">
                {serviceName}
              </SheetTitle>
              {visit.clientName && (
                <p className="text-sm text-slate-300 mt-0.5">for {visit.clientName}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {job?.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-slate-300 hover:text-white hover:bg-slate-700 px-2"
                  onClick={() => { onOpenChange(false); router.push(`/crm/scheduling/jobs/${job.id}`); }}
                >
                  View Job →
                </Button>
              )}
              {visit.status === "completed" && visit.clientId && (
                <Button
                  size="sm"
                  className="h-7 text-xs bg-brand-500 hover:bg-brand-600 text-white px-3"
                  onClick={handleInvoice}
                  disabled={invoicing}
                >
                  <FileText className="mr-1 h-3 w-3" />
                  Invoice
                </Button>
              )}
            </div>
          </div>
          {job?.serviceAddress && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
              <MapPin className="h-3 w-3" />
              {job.serviceAddress}{job.serviceCity ? `, ${job.serviceCity}` : ""}
            </div>
          )}
        </SheetHeader>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: form + notes */}
          <div className="flex-1 overflow-y-auto">

            {/* Schedule / assign section */}
            <div className="px-5 pt-4 pb-3 border-b space-y-2.5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                {/* Schedule Date */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Schedule Date
                  </label>
                  <span className="text-sm text-slate-700">{visit.scheduledDate}</span>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Status
                  </label>
                  <Select value={status} onValueChange={(v) => setStatus(v as VisitStatus)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Assigned To */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Assigned To
                  </label>
                  <Select
                    value={crewId || "unassigned"}
                    onValueChange={(v) => setCrewId(v === "unassigned" ? "" : v)}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned" className="text-xs">Unassigned</SelectItem>
                      {crews.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Sub Status */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Sub Status
                  </label>
                  <Select
                    value={subStatus || "none"}
                    onValueChange={(v) => setSubStatus(v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">None</SelectItem>
                      {SUB_STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Appointment Start */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Appointment Start
                  </label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>

                {/* Appointment End */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Appointment End
                  </label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Notes tabs */}
            <Tabs defaultValue="job-notes" className="flex flex-col flex-1">
              <div className="border-b bg-slate-700">
                <TabsList className="h-9 rounded-none bg-transparent justify-start px-4 gap-0">
                  {(["job-notes","job-comments","client-notes","invoice-desc"] as const).map((v, i) => {
                    const cnt = v === "job-notes" ? visit.jobComments.length + (visit.notesToCrew ? 1 : 0) : 0;
                    const labels = ["Job Notes","Job Comments","Notes to Client","Invoice Desc."];
                    return (
                      <TabsTrigger
                        key={v}
                        value={v}
                        className="h-full rounded-none border-b-2 border-transparent px-4 py-0 text-xs font-medium text-slate-300 data-[state=active]:border-white data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-white"
                      >
                        {labels[i]}{cnt > 0 ? ` (${cnt})` : ""}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              {/* Job Notes */}
              <TabsContent value="job-notes" className="m-0 flex-1 p-4">
                {visit.notesToCrew && (
                  <div className="mb-3 rounded border border-yellow-200 bg-yellow-50 px-3 py-2.5">
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{visit.notesToCrew}</p>
                  </div>
                )}
                {visit.jobComments.length > 0 && (
                  <div className="space-y-2">
                    {visit.jobComments.map((c) => (
                      <div key={c.id} className="rounded bg-slate-50 border px-3 py-2">
                        <p className="text-[10px] font-semibold text-slate-500 mb-0.5">{c.authorName}</p>
                        <p className="text-xs text-slate-700">{c.text}</p>
                      </div>
                    ))}
                  </div>
                )}
                {!visit.notesToCrew && visit.jobComments.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No job notes yet</p>
                )}
              </TabsContent>

              {/* Job Comments */}
              <TabsContent value="job-comments" className="m-0 p-4 space-y-3">
                {visit.jobComments.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {visit.jobComments.map((c) => (
                      <div key={c.id} className="rounded bg-slate-50 border px-3 py-2">
                        <p className="text-[10px] font-semibold text-slate-500 mb-0.5">{c.authorName}</p>
                        <p className="text-xs text-slate-700">{c.text}</p>
                      </div>
                    ))}
                  </div>
                )}
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment…"
                  className="h-24 resize-none text-xs"
                />
                <Button size="sm" className="h-7 text-xs" onClick={addComment}>
                  Add Comment
                </Button>
              </TabsContent>

              {/* Notes to Client */}
              <TabsContent value="client-notes" className="m-0 p-4 space-y-3">
                <Textarea
                  value={notesToClient}
                  onChange={(e) => setNotesToClient(e.target.value)}
                  placeholder="Notes visible to client on invoice/portal…"
                  className="h-32 resize-none text-xs"
                />
                <p className="text-[10px] text-slate-400">Saved when you click Save below.</p>
              </TabsContent>

              {/* Invoice Desc */}
              <TabsContent value="invoice-desc" className="m-0 p-4 space-y-3">
                <Textarea
                  value={invoiceDesc}
                  onChange={(e) => setInvoiceDesc(e.target.value)}
                  placeholder="Description that will appear on the invoice…"
                  className="h-32 resize-none text-xs"
                />
                <p className="text-[10px] text-slate-400">Saved when you click Save below.</p>
              </TabsContent>
            </Tabs>

            {/* Products section */}
            {services.length > 0 && (
              <div className="border-t">
                <div className="bg-slate-700 px-4 py-2">
                  <p className="text-xs font-semibold text-white">Products ({services.length})</p>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-2">Service</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">Rate</th>
                      <th className="px-2 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.id} className="border-b">
                        <td className="px-4 py-2 text-slate-700">{s.serviceName}</td>
                        <td className="px-2 py-2 text-right text-slate-500">{s.qty}</td>
                        <td className="px-2 py-2 text-right text-slate-500">
                          {s.rateCents != null ? formatCurrency(s.rateCents) : "—"}
                        </td>
                        <td className="px-2 py-2 text-right font-medium text-slate-700">
                          {s.rateCents != null ? formatCurrency(s.rateCents * s.qty) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right: costing panel */}
          <div className="w-44 shrink-0 border-l bg-slate-50 flex flex-col">
            <div className="px-4 pt-4 pb-3 border-b">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-3">
                Job Costing
              </p>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">Billing Mode</span>
                  <span className="text-[11px] font-medium text-slate-700">Flat Rate</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">B. Hours</span>
                  <span className="text-[11px] font-medium text-slate-700 text-right">
                    {budgetedHours != null ? budgetedHours.toFixed(2) : "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">Hours</span>
                  <Input
                    type="number" step="0.25" value={actualHours}
                    onChange={(e) => setActualHours(e.target.value)}
                    className="h-6 w-16 text-[11px] text-right px-1"
                    placeholder="0.00"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">Men (Total)</span>
                  <Input
                    type="number" min={0} value={menCount}
                    onChange={(e) => setMenCount(e.target.value)}
                    className="h-6 w-16 text-[11px] text-right px-1"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">Qty</span>
                  <Input
                    type="number" step="0.1" value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="h-6 w-16 text-[11px] text-right px-1"
                    placeholder="—"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">Rate</span>
                  <Input
                    type="number" step="0.01" value={rateCents}
                    onChange={(e) => setRateCents(e.target.value)}
                    className="h-6 w-16 text-[11px] text-right px-1"
                    placeholder="—"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">Expenses</span>
                  <span className="text-[11px] text-slate-400">0.00</span>
                </div>
              </div>
            </div>

            {/* Amount — green block matching SA */}
            <div className="mx-3 mt-3 rounded bg-green-500 px-3 py-3 text-center">
              <p className="text-lg font-bold text-white leading-tight">
                {formatCurrency(amt)}
              </p>
              <p className="text-[10px] text-green-100 mt-0.5">Amount</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between shrink-0 border-t bg-white px-5 py-3">
          <p className="text-[10px] text-slate-400">
            Show: <span className="text-brand-600 cursor-pointer hover:underline">Attachments</span>,{" "}
            <span className="text-brand-600 cursor-pointer hover:underline">Forms</span>
          </p>
          <div className="flex items-center gap-3">
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white h-8 text-xs px-6"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? "Saving…" : "Save"}
            </Button>
            <button
              className="text-xs text-slate-500 hover:text-slate-700"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── team assignment dialog ────────────────────────────────────────────────────

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function TeamAssignDialog({
  open,
  onOpenChange,
  visits,
  crews,
  selectedDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  visits: CRMJobVisit[];
  crews: { id: string; name: string }[];
  selectedDate: string;
}) {
  const { mutateAsync: updateVisit } = useUpdateVisit();
  const [pending, setPending] = useState(false);

  const unassigned = visits.filter((v) => !v.crewId);
  const byCrew = crews.map((c) => ({
    crew: c,
    visits: visits.filter((v) => v.crewId === c.id),
  }));

  async function reassign(visitId: string, crewId: string | null) {
    try {
      await updateVisit({ id: visitId, updates: { crew_id: crewId } });
    } catch {
      toast.error("Failed to reassign");
    }
  }

  async function dispatchAll() {
    setPending(true);
    try {
      const scheduled = visits.filter((v) => v.status === "scheduled" && v.crewId);
      await Promise.all(
        scheduled.map((v) =>
          updateVisit({
            id: v.id,
            updates: { status: "dispatched", dispatched_at: new Date().toISOString() },
          })
        )
      );
      toast.success(`${scheduled.length} visit${scheduled.length !== 1 ? "s" : ""} dispatched`);
      onOpenChange(false);
    } catch {
      toast.error("Dispatch failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0 bg-slate-800 text-white px-5 py-3">
          <DialogTitle className="text-sm font-semibold">
            Team Assignment —{" "}
            <span className="text-red-300">{selectedDate}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Unassigned pool */}
          <div className="w-52 shrink-0 border-r bg-green-50 p-4">
            <p className="text-[10px] font-semibold uppercase text-green-700 tracking-wide mb-3">
              Unassigned ({unassigned.length})
            </p>
            <div className="space-y-1.5">
              {unassigned.length === 0 ? (
                <p className="text-xs text-green-600 italic">All visits assigned</p>
              ) : (
                unassigned.map((v) => {
                  const svcName = v.job?.services?.[0]?.serviceName ?? "Visit";
                  return (
                    <div key={v.id} className="rounded bg-white border border-green-200 px-2 py-1.5">
                      <p className="text-xs font-medium text-slate-700 truncate">{v.clientName ?? "—"}</p>
                      <p className="text-[10px] text-slate-400 truncate">{svcName}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {crews.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => reassign(v.id, c.id)}
                            className="text-[9px] bg-slate-100 hover:bg-brand-100 hover:text-brand-700 text-slate-500 rounded px-1.5 py-0.5 transition-colors"
                          >
                            → {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Crew columns */}
          <div className="flex-1 overflow-x-auto">
            <div className="flex h-full min-w-max">
              {byCrew.map(({ crew, visits: crewVisits }) => (
                <div key={crew.id} className="w-48 shrink-0 border-r p-4">
                  <p className="text-[10px] font-semibold uppercase text-slate-600 tracking-wide mb-3 truncate">
                    {crew.name} ({crewVisits.length})
                  </p>
                  <div className="space-y-1.5">
                    {crewVisits.map((v) => {
                      const svcName = v.job?.services?.[0]?.serviceName ?? "Visit";
                      return (
                        <div key={v.id} className="rounded bg-slate-50 border px-2 py-1.5 group relative">
                          <p className="text-xs font-medium text-slate-700 truncate">{v.clientName ?? "—"}</p>
                          <p className="text-[10px] text-slate-400 truncate">{svcName}</p>
                          <StatusIcon status={v.status} />
                          <button
                            onClick={() => reassign(v.id, null)}
                            className="absolute top-1 right-1 hidden group-hover:flex text-[9px] text-slate-400 hover:text-red-500"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {byCrew.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-slate-400">No crews configured</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between shrink-0 border-t bg-white px-5 py-3">
          <p className="text-xs text-slate-500">
            {visits.filter((v) => v.crewId).length} of {visits.length} visits assigned
          </p>
          <div className="flex items-center gap-2">
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white h-8 text-xs px-4"
              onClick={dispatchAll}
              disabled={pending}
            >
              <Smartphone className="mr-1.5 h-3.5 w-3.5" />
              {pending ? "Dispatching…" : "Dispatch Assigned"}
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── visit row ──────────────────────────────────────────────────────────────────

function VisitRow({
  visit,
  index,
  selectedDate,
  onOpen,
  driveMinsToNext,
}: {
  visit: CRMJobVisit;
  index: number;
  selectedDate: string;
  onOpen: (v: CRMJobVisit) => void;
  driveMinsToNext?: number;
}) {
  const job      = visit.job;
  const services = job?.services ?? [];
  const serviceName = services.length > 0 ? services.map((s) => s.serviceName).join(", ") : "—";
  const effectiveRate = visit.rateCents ?? job?.rateCents ?? null;
  const budgetedHours = job?.budgetedHours;

  const lastSvc = job?.lastServiceDate
    ? new Date(job.lastServiceDate + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
    : "—";

  const serviceColor = services.length > 0
    ? "bg-green-100 text-green-700 border-green-200"
    : "bg-slate-100 text-slate-500 border-slate-200";

  return (
    <tr
      className="group border-b border-slate-100 text-xs hover:bg-blue-50 cursor-pointer"
      onClick={() => onOpen(visit)}
    >
      {/* Order */}
      <td className="w-8 px-2 py-2 text-center font-mono">
        <span className="text-slate-400">{visit.orderNum ?? index + 1}</span>
        {driveMinsToNext !== undefined && (
          <div className="text-[9px] text-blue-500 font-normal leading-tight whitespace-nowrap">
            ↓{driveMinsToNext}m
          </div>
        )}
      </td>

      {/* St */}
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <StatusCycleButton visit={visit} />
      </td>

      {/* Client + address */}
      <td className="min-w-[160px] px-2 py-2">
        <p className="font-semibold text-brand-600 truncate max-w-[160px]">{visit.clientName ?? "—"}</p>
        {job?.serviceAddress && (
          <p className="text-slate-400 truncate max-w-[160px] text-[10px]">{job.serviceAddress}</p>
        )}
      </td>

      {/* Service */}
      <td className="min-w-[110px] px-2 py-2">
        <span className={cn(
          "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold border truncate max-w-[110px]",
          serviceColor
        )}>
          {serviceName}
        </span>
      </td>

      {/* Date */}
      <td className="px-2 py-2 text-slate-500 whitespace-nowrap">{visit.scheduledDate}</td>

      {/* City */}
      <td className="px-2 py-2 text-slate-500">{job?.serviceCity ?? "—"}</td>

      {/* Zip */}
      <td className="px-2 py-2 text-slate-400">{job?.serviceZip ?? "—"}</td>

      {/* Assigned */}
      <td className="min-w-[90px] px-2 py-2 text-slate-600 font-medium">
        {visit.crewName ?? <span className="text-slate-300 italic">—</span>}
      </td>

      {/* Last Svc */}
      <td className="px-2 py-2 text-slate-400 whitespace-nowrap">{lastSvc}</td>

      {/* Start */}
      <td className="px-2 py-2 text-slate-400 whitespace-nowrap">{visit.startTime ?? "—"}</td>

      {/* End */}
      <td className="px-2 py-2 text-slate-400 whitespace-nowrap">{visit.endTime ?? "—"}</td>

      {/* B Hrs */}
      <td className="px-2 py-2 text-right text-slate-500">
        {budgetedHours != null ? budgetedHours.toFixed(2) : "—"}
      </td>

      {/* Actual */}
      <td className="px-2 py-2 text-right text-slate-500">
        {visit.actualHours != null ? visit.actualHours.toFixed(2) : "—"}
      </td>

      {/* Men */}
      <td className="px-2 py-2 text-center text-slate-400">{visit.menCount}</td>

      {/* Qty */}
      <td className="px-2 py-2 text-right text-slate-400">
        {visit.qty != null ? visit.qty.toFixed(1) : "—"}
      </td>

      {/* Rate */}
      <td className="px-2 py-2 text-right text-slate-500">
        {effectiveRate != null ? formatCurrency(effectiveRate) : "—"}
      </td>

      {/* Amt */}
      <td className="px-2 py-2 text-right font-medium text-slate-700">
        {effectiveRate != null ? formatCurrency(effectiveRate) : "—"}
      </td>
    </tr>
  );
}

// ── totals row ─────────────────────────────────────────────────────────────────

function TotalsRow({ visits }: { visits: CRMJobVisit[] }) {
  const totalBHrs = visits.reduce((s, v) => s + (v.job?.budgetedHours ?? 0), 0);
  const totalAct  = visits.reduce((s, v) => s + (v.actualHours ?? 0), 0);
  const totalAmt  = visits.reduce((s, v) => s + (v.rateCents ?? v.job?.rateCents ?? 0), 0);

  return (
    <tr className="bg-slate-700 text-[10px] font-semibold text-white">
      <td colSpan={11} className="px-2 py-1.5 text-right text-slate-300">Totals</td>
      <td className="px-2 py-1.5 text-right">{totalBHrs > 0 ? totalBHrs.toFixed(2) : "—"}</td>
      <td className="px-2 py-1.5 text-right">{totalAct > 0 ? totalAct.toFixed(2) : "—"}</td>
      <td colSpan={3} className="px-2 py-1.5" />
      <td className="px-2 py-1.5 text-right">{totalAmt > 0 ? formatCurrency(totalAmt) : "—"}</td>
    </tr>
  );
}

// ── filter tabs ───────────────────────────────────────────────────────────────

type FilterTab = "all" | "scheduled" | "dispatched" | "completed" | "cancelled" | "skipped";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all",        label: "All" },
  { value: "scheduled",  label: "Scheduled" },
  { value: "dispatched", label: "Dispatched" },
  { value: "completed",  label: "Completed" },
  { value: "cancelled",  label: "Cancelled" },
  { value: "skipped",    label: "Skipped" },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][date.getDay()];
  const mo   = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1];
  return `${day} ${mo} ${String(d).padStart(2,"0")}, ${y}`;
}

// ── main board ─────────────────────────────────────────────────────────────────

export function DispatchBoard() {
  const [selectedDate,    setSelectedDate]    = useState(() => toLocalDateString(new Date()));
  const [crewFilter,      setCrewFilter]      = useState<string>("all");
  const [statusFilter,    setStatusFilter]    = useState<FilterTab>("all");
  const [search,          setSearch]          = useState("");
  const [detailVisit,     setDetailVisit]     = useState<CRMJobVisit | null>(null);
  const [teamAssignOpen,  setTeamAssignOpen]  = useState(false);

  // Route optimization state
  const [optimizing,         setOptimizing]         = useState(false);
  const [optimizedOrder,     setOptimizedOrder]     = useState<string[] | null>(null); // ordered visit IDs
  const [driveTimeMap,       setDriveTimeMap]       = useState<Map<string, number>>(new Map()); // visitId → minsToNext
  const [totalDriveMins,     setTotalDriveMins]     = useState<number | null>(null);

  const { data: visits, isLoading } = useVisitsForDate(selectedDate);
  const { data: crews }             = useCRMCrews();

  const allVisits = visits ?? [];

  async function handleOptimizeRoute() {
    const targets = filtered.filter((v) => v.job?.serviceAddress);
    if (targets.length < 2) {
      toast.error("Need at least 2 visits with a service address to optimize. Try assigning visits to a crew first.");
      return;
    }
    setOptimizing(true);
    try {
      const res = await fetch("/api/crm/route-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitIds: targets.map((v) => v.id) }),
      });
      const data = await res.json() as {
        orderedVisitIds?: string[];
        driveTimes?: { visitId: string; minutesToNext: number }[];
        totalDriveMinutes?: number;
        error?: string;
      };
      if (!res.ok || data.error) {
        toast.error(data.error ?? "Route optimization failed");
        return;
      }
      setOptimizedOrder(data.orderedVisitIds ?? null);
      const dtMap = new Map<string, number>();
      for (const dt of data.driveTimes ?? []) dtMap.set(dt.visitId, dt.minutesToNext);
      setDriveTimeMap(dtMap);
      setTotalDriveMins(data.totalDriveMinutes ?? null);
      toast.success(`Route optimized — ${data.totalDriveMinutes} min total drive time`);
    } catch {
      toast.error("Failed to reach route optimizer");
    } finally {
      setOptimizing(false);
    }
  }

  function clearOptimization() {
    setOptimizedOrder(null);
    setDriveTimeMap(new Map());
    setTotalDriveMins(null);
  }

  const filtered = allVisits.filter((v) => {
    if (crewFilter !== "all" && v.crewId !== crewFilter) return false;
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    if (search) {
      const q   = search.toLowerCase();
      const cli = (v.clientName ?? "").toLowerCase();
      const cty = (v.job?.serviceCity ?? "").toLowerCase();
      const svc = (v.job?.services ?? []).map((s) => s.serviceName).join(" ").toLowerCase();
      if (!cli.includes(q) && !cty.includes(q) && !svc.includes(q)) return false;
    }
    return true;
  });

  // If an optimized order exists, re-sort filtered by that order
  const displayVisits = optimizedOrder
    ? [...filtered].sort((a, b) => {
        const ai = optimizedOrder.indexOf(a.id);
        const bi = optimizedOrder.indexOf(b.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
    : filtered;

  const completedCount  = filtered.filter((v) => v.status === "completed").length;
  const dispatchedCount = filtered.filter((v) => v.status === "dispatched").length;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Page header */}
      <PageHeader
        title="Dispatch Board"
        description="Schedule and dispatch daily job visits"
      />

      {/* Week strip */}
      <WeekStrip selectedDate={selectedDate} onDateChange={(d) => { setSelectedDate(d); clearOptimization(); }} />

      {/* SA-style dark action bar */}
      <div className="bg-[#4a4a4a] px-4 py-2 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-300 font-medium whitespace-nowrap">
            {formatDisplayDate(selectedDate)}
          </span>

          {/* Status filter tabs */}
          <div className="flex items-center">
            {FILTER_TABS.map((t) => {
              const cnt = t.value === "all"
                ? allVisits.length
                : allVisits.filter((v) => v.status === t.value).length;
              return (
                <button
                  key={t.value}
                  onClick={() => setStatusFilter(t.value)}
                  className={cn(
                    "px-2.5 py-1 text-[10px] font-medium rounded transition-colors",
                    statusFilter === t.value
                      ? "bg-white text-slate-800"
                      : "text-slate-300 hover:text-white"
                  )}
                >
                  {t.label}
                  {cnt > 0 && (
                    <span className={cn(
                      "ml-1 rounded-full px-1 text-[9px]",
                      statusFilter === t.value ? "bg-slate-200 text-slate-700" : "bg-slate-600 text-slate-300"
                    )}>
                      {cnt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-7 w-40 pl-6 text-[11px] bg-[#5a5a5a] border-[#6a6a6a] text-white placeholder:text-slate-400 focus:bg-[#3a3a3a]"
            />
          </div>

          {/* Crew filter */}
          <Select value={crewFilter} onValueChange={setCrewFilter}>
            <SelectTrigger className="h-7 w-36 text-[11px] bg-[#5a5a5a] border-[#6a6a6a] text-white">
              <SelectValue placeholder="All Crews" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Crews</SelectItem>
              {(crews ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-px h-5 bg-slate-600" />

          <Button size="sm" variant="ghost"
            className="h-7 text-[11px] text-slate-300 hover:text-white hover:bg-slate-600 gap-1 px-2"
            onClick={() => setTeamAssignOpen(true)}
          >
            <Users className="h-3.5 w-3.5" />
            Team Assign
          </Button>

          <Button size="sm" variant="ghost"
            className={cn(
              "h-7 text-[11px] gap-1 px-2",
              optimizedOrder
                ? "text-blue-300 hover:text-blue-100 hover:bg-slate-600"
                : "text-slate-300 hover:text-white hover:bg-slate-600"
            )}
            onClick={handleOptimizeRoute}
            disabled={optimizing}
          >
            <Route className="h-3.5 w-3.5" />
            {optimizing ? "Optimizing…" : optimizedOrder ? "Re-Optimize" : "Optimize Route"}
          </Button>

          {optimizedOrder && (
            <Button size="sm" variant="ghost"
              className="h-7 text-[11px] text-red-400 hover:text-red-300 hover:bg-slate-600 gap-1 px-2"
              onClick={clearOptimization}
            >
              <XIcon className="h-3 w-3" />
              Clear
            </Button>
          )}

          <Button size="sm" variant="ghost"
            className="h-7 text-[11px] text-slate-300 hover:text-white hover:bg-slate-600 gap-1 px-2"
          >
            <MapPin className="h-3.5 w-3.5" />
            Show Map
          </Button>

          <Button size="sm" variant="ghost"
            className="h-7 text-[11px] text-slate-300 hover:text-white hover:bg-slate-600 gap-1 px-2"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Stats
          </Button>

          <Button size="sm" variant="ghost"
            className="h-7 text-[11px] text-slate-300 hover:text-white hover:bg-slate-600 gap-1 px-2"
          >
            <Columns3 className="h-3.5 w-3.5" />
            Columns
          </Button>
        </div>
      </div>

      {/* Count bar */}
      <div className="bg-white border-b px-4 py-1.5 flex items-center gap-4 text-[11px] shrink-0">
        <span className="font-semibold text-slate-700">
          {isLoading ? "Loading…" : `${filtered.length} Job${filtered.length !== 1 ? "s" : ""} Total`}
        </span>
        {!isLoading && dispatchedCount > 0 && (
          <span className="text-orange-500">{dispatchedCount} dispatched</span>
        )}
        {!isLoading && completedCount > 0 && (
          <span className="text-green-600">{completedCount} completed</span>
        )}
        {optimizedOrder && totalDriveMins !== null && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-blue-700 font-medium">
            <Route className="h-3 w-3" />
            Route optimized · {totalDriveMins} min drive total
          </span>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[1200px] text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <th className="w-8  px-2 py-2.5">#</th>
              <th className="w-8  px-2 py-2.5">St</th>
              <th className="min-w-[160px] px-2 py-2.5">Client</th>
              <th className="min-w-[110px] px-2 py-2.5">Service</th>
              <th className="px-2 py-2.5">Date</th>
              <th className="px-2 py-2.5">City</th>
              <th className="px-2 py-2.5">Zip</th>
              <th className="min-w-[90px]  px-2 py-2.5">Assigned</th>
              <th className="px-2 py-2.5">Last Svc</th>
              <th className="px-2 py-2.5">Start</th>
              <th className="px-2 py-2.5">End</th>
              <th className="px-2 py-2.5 text-right">B Hrs</th>
              <th className="px-2 py-2.5 text-right">Actual</th>
              <th className="px-2 py-2.5 text-center">Men</th>
              <th className="px-2 py-2.5 text-right">Qty</th>
              <th className="px-2 py-2.5 text-right">Rate</th>
              <th className="px-2 py-2.5 text-right">Amt</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && displayVisits.length > 0 && (
              <TotalsRow visits={displayVisits} />
            )}

            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 17 }).map((__, j) => (
                    <td key={j} className="px-2 py-2.5">
                      <Skeleton className="h-3 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : displayVisits.length === 0 ? (
              <tr>
                <td colSpan={17} className="py-20 text-center text-sm text-slate-400">
                  {search || crewFilter !== "all" || statusFilter !== "all"
                    ? "No visits match the current filters"
                    : "No visits scheduled for this date"}
                </td>
              </tr>
            ) : (
              displayVisits.map((visit, i) => (
                <VisitRow
                  key={visit.id}
                  visit={visit}
                  index={i}
                  selectedDate={selectedDate}
                  onOpen={setDetailVisit}
                  driveMinsToNext={driveTimeMap.get(visit.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Job detail sheet */}
      {detailVisit && (
        <JobDetailSheet
          visit={detailVisit}
          open={!!detailVisit}
          onOpenChange={(o) => { if (!o) setDetailVisit(null); }}
          crews={crews ?? []}
        />
      )}

      {/* Team assignment dialog */}
      <TeamAssignDialog
        open={teamAssignOpen}
        onOpenChange={setTeamAssignOpen}
        visits={allVisits}
        crews={crews ?? []}
        selectedDate={selectedDate}
      />
    </div>
  );
}
