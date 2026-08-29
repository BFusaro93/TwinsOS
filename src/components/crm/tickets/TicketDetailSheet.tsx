"use client";

import { useState } from "react";
import {
  useCloseTicket,
  useUpdateTicket,
  useTicketLinks,
  useAddTicketLink,
  useRemoveTicketLink,
  useDeleteTicket,
  useClearSmsConsentPendingPhone,
} from "@/lib/hooks/use-tickets";
import { useEstimates } from "@/lib/hooks/use-estimates";
import { useInvoices } from "@/lib/hooks/use-invoices";
import { useJobsList } from "@/lib/hooks/use-crm-jobs";
import { useProjects } from "@/lib/hooks/use-projects";
import { useSelectableEmployees } from "@/lib/hooks/use-employees";
import { useClients } from "@/lib/hooks/use-clients";
import { NewClientDialog } from "@/components/crm/NewClientDialog";
import { useOrgList } from "@/lib/hooks/use-org-lists";
import {
  useTicketContributors,
  useAddTicketContributor,
  useRemoveTicketContributor,
} from "@/lib/hooks/use-ticket-contributors";
import { CommentsSection } from "@/components/shared/CommentsSection";
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EditButton } from "@/components/shared/EditButton";
import { StatusFlowIndicator } from "@/components/shared/StatusFlowIndicator";
import { RecordDetailTabs } from "@/components/shared/RecordDetailTabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { AlertTriangle, Download, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import type { CRMTicket, TicketStatus, TicketPriority, TicketType, NewTicketFormValues } from "@/types/crm-tickets";

// ── status flow ───────────────────────────────────────────────────────────────

const TICKET_FLOW_STEPS = [
  { label: "Open" },
  { label: "In Progress" },
  { label: "Closed" },
];

const TICKET_STATUS_INDEX: Record<TicketStatus, number> = {
  open:    0,
  on_hold: 0,
  pending: 1,
  closed:  2,
};

const TICKET_STATUS_VARIANT: Record<TicketStatus, string> = {
  open:    "open",
  on_hold: "on_hold",
  pending: "pending",
  closed:  "closed",
};

const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open:    "Open",
  on_hold: "On Hold",
  pending: "Pending",
  closed:  "Closed",
};

const FALLBACK_CATEGORIES = ["Uncategorized", "Estimate", "Billing", "Change Service", "Complaint", "Other"];

// ── print helper ──────────────────────────────────────────────────────────────

// Ticket fields (subject, category, client/assignee names) can originate
// from an anonymous public-form submission with no sanitization applied
// upstream (submit-form-response.ts). Interpolating them unescaped into
// document.write() lets a crafted "Full Name" or subject field execute
// script in a staff member's browser session the moment they click Print.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function printTicket(ticket: CRMTicket) {
  const win = window.open("", "_blank", "width=700,height=900");
  if (!win) { toast.error("Pop-up blocked — allow pop-ups to print tickets"); return; }
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Ticket #${escapeHtml(String(ticket.ticketNumber))}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; padding: 32px; color: #111; font-size: 14px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta { color: #555; margin-bottom: 24px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    td:first-child { font-weight: 600; width: 140px; color: #555; }
    .body-section { margin-top: 20px; border-top: 2px solid #eee; padding-top: 16px; }
    .body-section h2 { font-size: 13px; text-transform: uppercase; letter-spacing:.05em; color:#888; margin-bottom:8px; }
    .body-text { white-space: pre-wrap; line-height: 1.6; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Ticket #${escapeHtml(String(ticket.ticketNumber))}</h1>
  <div class="meta">Printed ${new Date().toLocaleString()}</div>
  <table>
    <tr><td>Subject</td><td>${escapeHtml(ticket.subject ?? "(no subject)")}</td></tr>
    <tr><td>Type</td><td style="text-transform:capitalize">${escapeHtml(ticket.type)}</td></tr>
    <tr><td>Status</td><td>${escapeHtml(TICKET_STATUS_LABEL[ticket.status])}</td></tr>
    <tr><td>Priority</td><td style="text-transform:capitalize">${escapeHtml(ticket.priority)}</td></tr>
    <tr><td>Category</td><td>${escapeHtml(ticket.category ?? "—")}</td></tr>
    <tr><td>Client</td><td>${escapeHtml(ticket.clientName ?? "—")}</td></tr>
    <tr><td>Assigned To</td><td>${escapeHtml(ticket.assignedTo ?? "—")}</td></tr>
    <tr><td>Due Date</td><td>${ticket.dueDate ? new Date(ticket.dueDate + "T12:00:00").toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" }) : "—"}</td></tr>
    <tr><td>Created</td><td>${new Date(ticket.createdAt).toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" })}</td></tr>
  </table>
  ${ticket.body ? `<div class="body-section"><h2>Notes</h2><p class="body-text">${escapeHtml(ticket.body)}</p></div>` : ""}
  <script>window.onload=function(){window.print();}<\/script>
</body>
</html>`);
  win.document.close();
}

// ── edit form ─────────────────────────────────────────────────────────────────

interface EditFormProps {
  ticket: CRMTicket;
  onCancel: () => void;
  onSaved: () => void;
}

function EditForm({ ticket, onCancel, onSaved }: EditFormProps) {
  const updateTicket = useUpdateTicket();
  const { data: clients } = useClients();
  const [newClientOpen, setNewClientOpen] = useState(false);
  const { data: employees } = useSelectableEmployees();
  const users = (employees ?? []).map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }));
  const { data: categoryOptions } = useOrgList("ticket_categories");
  const categories = categoryOptions && categoryOptions.length > 0
    ? categoryOptions.map((o) => o.value)
    : FALLBACK_CATEGORIES;

  const TYPE_OPTS: Array<{ label: string; value: TicketType }> = [
    { label: "Note",  value: "note" },
    { label: "Call",  value: "call" },
    { label: "Event", value: "event" },
  ];

  const [form, setForm] = useState<Partial<NewTicketFormValues>>({
    type:       ticket.type,
    clientId:   ticket.clientId,
    category:   ticket.category ?? "Uncategorized",
    subject:    ticket.subject ?? "",
    body:       ticket.body ?? "",
    status:     ticket.status,
    assignedTo:   ticket.assignedTo ?? "",
    assignedToId: ticket.assignedToId ?? null,
    dueDate:    ticket.dueDate ?? "",
    priority:   ticket.priority,
  });

  function set<K extends keyof NewTicketFormValues>(key: K, value: NewTicketFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    await updateTicket.mutateAsync({ id: ticket.id, updates: form });
    toast.success("Ticket updated");
    onSaved();
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-4 overflow-y-auto">
      <div className="space-y-1.5">
        <Label className="text-xs">Type</Label>
        <div className="flex gap-1">
          {TYPE_OPTS.map((t) => (
            <button key={t.value} type="button" onClick={() => set("type", t.value)}
              className={cn(
                "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                form.type === t.value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Subject</Label>
        <Input value={form.subject ?? ""} onChange={(e) => set("subject", e.target.value)}
          className="h-9 text-sm" placeholder="Ticket subject…" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Body</Label>
        <Textarea value={form.body ?? ""} onChange={(e) => set("body", e.target.value)}
          rows={4} className="text-sm" placeholder="Details…" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Category</Label>
          <Select value={form.category ?? ""} onValueChange={(v) => set("category", v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Priority</Label>
          <Select value={form.priority ?? "normal"} onValueChange={(v) => set("priority", v as TicketPriority)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={form.status ?? "open"} onValueChange={(v) => set("status", v as TicketStatus)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Due Date</Label>
          <Input type="date" value={form.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value)}
            className="h-9 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Client</Label>
          <div className="flex gap-1.5">
            <Select value={form.clientId ?? "none"} onValueChange={(v) => set("clientId", v === "none" ? null : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select client…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client</SelectItem>
                {(clients ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 px-2.5"
              onClick={() => setNewClientOpen(true)}
              title="Create a new client and link it to this ticket"
            >
              <UserPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <NewClientDialog
            open={newClientOpen}
            onOpenChange={setNewClientOpen}
            onCreated={(client) => {
              set("clientId", client.id);
              toast.success(`${client.displayName} created and linked to this ticket`);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Assigned To</Label>
          <Select
            value={form.assignedToId || "unassigned"}
            onValueChange={(v) => {
              if (v === "unassigned") {
                setForm((prev) => ({ ...prev, assignedTo: "", assignedToId: null }));
                return;
              }
              const user = (users ?? []).find((u) => u.id === v);
              setForm((prev) => ({ ...prev, assignedTo: user?.name ?? "", assignedToId: v }));
            }}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select user…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {(users ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t">
        <Button variant="outline" size="sm" className="text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="text-xs" onClick={handleSave} disabled={updateTicket.isPending}>
          {updateTicket.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

// ── linked records picker ─────────────────────────────────────────────────────

function LinkedRecordsPicker({ ticket }: { ticket: CRMTicket }) {
  const addLink = useAddTicketLink();
  const removeLink = useRemoveTicketLink();
  const { data: links } = useTicketLinks(ticket.id);
  const [newLinkType, setNewLinkType] = useState<"estimate" | "invoice" | "job" | "project">("estimate");
  const [selectedId, setSelectedId] = useState("");

  const clientId = ticket.clientId ?? "";
  const { data: estimates } = useEstimates(clientId || undefined);
  const { data: invoices } = useInvoices(clientId || undefined);
  const { data: jobs } = useJobsList(clientId ? { clientId } : undefined);
  const { data: allProjects } = useProjects();
  // Projects aren't always tied to a client — narrow to the ticket's client when set,
  // otherwise offer the full active project list.
  const projects = clientId
    ? (allProjects ?? []).filter((p) => p.clientId === clientId)
    : (allProjects ?? []);

  const options: { id: string; label: string }[] =
    newLinkType === "estimate"
      ? (estimates ?? []).map((e) => ({ id: e.id, label: `#${e.estimateNumber} — ${e.description || "(no description)"}` }))
      : newLinkType === "invoice"
      ? (invoices ?? []).map((i) => ({ id: i.id, label: `#${i.invoiceNumber} — ${i.description || "(no description)"}` }))
      : newLinkType === "job"
      ? (jobs ?? []).map((j) => ({ id: j.id, label: j.serviceAddress || j.jobType || `Job ${j.id.slice(0, 8)}` }))
      : projects.map((p) => ({ id: p.id, label: p.name }));

  async function handleAdd() {
    if (!selectedId) return;
    const opt = options.find((o) => o.id === selectedId);
    if (!opt) return;
    await addLink.mutateAsync({ ticketId: ticket.id, linkType: newLinkType, linkedId: selectedId, linkedLabel: opt.label });
    setSelectedId("");
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Linked Records</p>
      {(links ?? []).length === 0 ? (
        <p className="text-xs text-slate-400 mb-3">No links yet.</p>
      ) : (
        <ul className="space-y-1.5 mb-3">
          {(links ?? []).map((link) => (
            <li key={link.id} className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="text-[10px] capitalize shrink-0">{link.linkType}</Badge>
              <span className="flex-1 text-slate-700 truncate text-xs">{link.linkedLabel}</span>
              <button type="button" className="text-slate-400 hover:text-red-500"
                onClick={() => removeLink.mutate({ id: link.id, ticketId: ticket.id })}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-md border bg-slate-50 p-3 space-y-2">
        <p className="text-xs font-medium text-slate-500">Add Link</p>
        <div className="flex gap-2">
          <Select value={newLinkType} onValueChange={(v) => { setNewLinkType(v as "estimate" | "invoice" | "job" | "project"); setSelectedId(""); }}>
            <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="estimate">Estimate</SelectItem>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="job">Job</SelectItem>
              <SelectItem value="project">Project</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder={clientId || newLinkType === "project" ? `Select ${newLinkType}…` : "No client on ticket"} />
            </SelectTrigger>
            <SelectContent>
              {options.length === 0 ? (
                <SelectItem value="__empty" disabled>
                  {clientId || newLinkType === "project" ? `No ${newLinkType}s found` : "Ticket has no client"}
                </SelectItem>
              ) : (
                options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)
              )}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAdd}
          disabled={addLink.isPending || !selectedId}>
          {addLink.isPending ? "Adding…" : "Add"}
        </Button>
      </div>
    </div>
  );
}

// ── details tab content ───────────────────────────────────────────────────────

function DetailsTab({ ticket, onStatusChange, isUpdating }: {
  ticket: CRMTicket;
  onStatusChange: (s: TicketStatus) => void;
  isUpdating: boolean;
}) {
  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d + (d.includes("T") ? "" : "T12:00:00")).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  };

  const STATUS_BUTTONS: Array<{ status: TicketStatus; label: string; className: string }> = [
    { status: "open",    label: "Mark Open",    className: "text-blue-700 border-blue-300 hover:bg-blue-50" },
    { status: "on_hold", label: "Put On Hold",  className: "text-yellow-700 border-yellow-300 hover:bg-yellow-50" },
    { status: "pending", label: "Mark Pending", className: "text-slate-700 border-slate-300 hover:bg-slate-50" },
    { status: "closed",  label: "Close Ticket", className: "text-green-700 border-green-300 hover:bg-green-50" },
  ];

  const clearSmsWarning = useClearSmsConsentPendingPhone();

  return (
    <div className="p-6 space-y-6">
      {ticket.smsConsentPendingPhone && (
        <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="font-medium">SMS consent given, but no phone number</p>
            <p className="mt-0.5 text-xs text-amber-700">
              This submission checked the text-message consent box, but no phone number was captured — consent couldn&apos;t
              be recorded on the client. Collect a phone number from them before texting.
            </p>
          </div>
          <button
            type="button"
            onClick={() => clearSmsWarning.mutate(ticket.id)}
            disabled={clearSmsWarning.isPending}
            className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Status flow */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
        <StatusFlowIndicator
          steps={TICKET_FLOW_STEPS}
          currentIndex={TICKET_STATUS_INDEX[ticket.status]}
          isTerminalError={false}
        />
        <div className="mt-3 flex gap-2 flex-wrap">
          {STATUS_BUTTONS.filter((b) => b.status !== ticket.status).map((b) => (
            <Button key={b.status} variant="outline" size="sm"
              className={cn("text-xs", b.className)}
              onClick={() => onStatusChange(b.status)}
              disabled={isUpdating}>
              {isUpdating ? "Saving…" : b.label}
            </Button>
          ))}
        </div>
      </div>

      <hr />

      {/* Two-column meta grid */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        {[
          { label: "Client",      value: ticket.clientName ?? "—" },
          { label: "Category",    value: ticket.category ?? "—" },
          { label: "Assigned To", value: ticket.assignedTo ?? "—" },
          { label: "Due Date",    value: formatDate(ticket.dueDate) },
          { label: "Created",     value: formatDate(ticket.createdAt) },
          { label: "Last Updated", value: formatDate(ticket.updatedAt) },
          { label: "Type",        value: <span className="capitalize">{ticket.type}</span> },
          { label: "Priority",    value: <span className="capitalize font-medium">{ticket.priority}</span> },
          ...(ticket.closedAt ? [{ label: "Closed", value: formatDate(ticket.closedAt) }] : []),
        ].map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs font-medium text-slate-400">{label}</dt>
            <dd className="mt-0.5 text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>

      {ticket.body && (
        <>
          <hr />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
            <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700 leading-relaxed">
              {ticket.body}
            </p>
          </div>
        </>
      )}

      <hr />
      <LinkedRecordsPicker ticket={ticket} />
    </div>
  );
}

// ── contributors tab ──────────────────────────────────────────────────────────

function ContributorsTab({ ticket }: { ticket: CRMTicket }) {
  const { data: contributors } = useTicketContributors(ticket.id);
  const addContributor = useAddTicketContributor();
  const removeContributor = useRemoveTicketContributor();
  const { data: employees } = useSelectableEmployees();
  const [selected, setSelected] = useState("");

  const existing = new Set((contributors ?? []).map((c) => c.userName));
  const available = (employees ?? [])
    .map((e) => `${e.firstName} ${e.lastName}`)
    .filter((name) => !existing.has(name));

  async function handleAdd() {
    if (!selected) return;
    await addContributor.mutateAsync({ ticketId: ticket.id, userName: selected });
    setSelected("");
    toast.success(`${selected} added as contributor`);
  }

  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-slate-500 leading-relaxed">
        Contributors are CC&apos;d on this ticket — they&apos;re visible to the team as participants in the conversation.
      </p>
      {(contributors ?? []).length === 0 ? (
        <p className="text-xs text-slate-400">No contributors yet.</p>
      ) : (
        <ul className="space-y-2">
          {(contributors ?? []).map((c) => {
            const initials = c.userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
            return (
              <li key={c.id} className="flex items-center gap-3 rounded-md border bg-slate-50 px-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                  {initials}
                </div>
                <span className="flex-1 text-sm font-medium text-slate-700">{c.userName}</span>
                <button type="button" onClick={() => removeContributor.mutate({ id: c.id, ticketId: ticket.id })}
                  className="text-slate-400 hover:text-red-500" title="Remove contributor">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex gap-2 pt-2 border-t">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="Add a contributor…" />
          </SelectTrigger>
          <SelectContent>
            {available.length === 0 ? (
              <SelectItem value="__none" disabled>All employees added</SelectItem>
            ) : (
              available.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)
            )}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 text-xs shrink-0"
          onClick={handleAdd} disabled={!selected || addContributor.isPending}>
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
}

// ── main sheet ────────────────────────────────────────────────────────────────

export interface TicketDetailSheetProps {
  ticket: CRMTicket | null;
  onClose: () => void;
}

export function TicketDetailSheet({ ticket, onClose }: TicketDetailSheetProps) {
  const closeTicket = useCloseTicket();
  const updateTicket = useUpdateTicket();
  const deleteTicket = useDeleteTicket();
  const { data: contributors } = useTicketContributors(ticket?.id ?? "");
  const [editing, setEditing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  if (!ticket) return null;

  async function handleStatusChange(status: TicketStatus) {
    if (!ticket) return;
    if (status === "closed") {
      await closeTicket.mutateAsync(ticket.id);
    } else {
      await updateTicket.mutateAsync({ id: ticket.id, updates: { status } });
    }
  }

  async function handleDelete() {
    if (!ticket) return;
    await deleteTicket.mutateAsync(ticket.id);
    setDeleteConfirmOpen(false);
    onClose();
    toast.success("Ticket deleted");
  }

  const isUpdating = closeTicket.isPending || updateTicket.isPending;
  const contributorCount = (contributors ?? []).length;

  const tabs = [
    {
      value: "details",
      label: "Details",
      content: <DetailsTab ticket={ticket} onStatusChange={handleStatusChange} isUpdating={isUpdating} />,
    },
    {
      value: "comments",
      label: "Comments & History",
      content: <div className="p-6"><CommentsSection recordType="ticket" recordId={ticket.id} /></div>,
    },
    {
      value: "files",
      label: "Files",
      content: <div className="p-6"><AttachmentsSection recordType="ticket" recordId={ticket.id} /></div>,
    },
    {
      value: "contributors",
      label: contributorCount > 0 ? `Contributors (${contributorCount})` : "Contributors",
      content: <ContributorsTab ticket={ticket} />,
    },
    {
      value: "audit",
      label: "Audit Trail",
      content: <div className="p-6"><AuditTrailTab recordType="ticket" recordId={ticket.id} /></div>,
    },
  ];

  return (
    <>
      <Sheet open={!!ticket} onOpenChange={(open) => { if (!open) { setEditing(false); onClose(); } }}>
        {/* Wider sheet so the header buttons don't wrap */}
        <SheetContent className="w-full sm:max-w-[620px] md:w-[620px] flex flex-col gap-0 p-0 overflow-hidden">

          {/* Header — title left, actions right, pr-10 clears the Sheet X button */}
          <div className="flex items-center justify-between border-b px-5 py-3 pr-10 shrink-0">
            <div className="min-w-0 mr-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-500">#{ticket.ticketNumber}</span>
                <span className="text-slate-300">·</span>
                <span className="text-sm font-semibold text-slate-900 truncate">{ticket.subject ?? "(no subject)"}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <StatusBadge
                variant={TICKET_STATUS_VARIANT[ticket.status] as Parameters<typeof StatusBadge>[0]["variant"]}
                label={TICKET_STATUS_LABEL[ticket.status]}
              />
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => printTicket(ticket)}>
                <Download className="h-3.5 w-3.5" />
                PDF
              </Button>
              <EditButton onClick={() => setEditing((v) => !v)} />
              <Button variant="ghost" size="icon"
                className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-500"
                onClick={() => setDeleteConfirmOpen(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Edit form or tabbed content */}
          <div className="flex-1 overflow-y-auto">
            {editing ? (
              <EditForm
                ticket={ticket}
                onCancel={() => setEditing(false)}
                onSaved={() => setEditing(false)}
              />
            ) : (
              <RecordDetailTabs tabs={tabs} defaultValue="details" />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>Ticket #{ticket.ticketNumber}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={deleteTicket.isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
