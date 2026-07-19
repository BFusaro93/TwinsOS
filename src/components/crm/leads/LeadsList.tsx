"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useLeads,
  useCreateLead,
  useConvertLeadToClient,
  useCloseLeadAsLost,
} from "@/lib/hooks/use-clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatCurrency } from "@/lib/utils";
import { Plus, UserCheck, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/types/crm";
import { useEstimates } from "@/lib/hooks/use-estimates";

function LeadRevenuePotential({ leadId }: { leadId: string }) {
  const { data: estimates } = useEstimates(leadId);
  const open = (estimates ?? []).filter((e) => e.stage !== "accepted" && e.stage !== "lost");
  const total = open.reduce((sum, e) => sum + e.totalCents, 0);
  if (total <= 0) return <span className="text-slate-300">—</span>;
  return <span className="font-medium text-green-700">{formatCurrency(total)}</span>;
}

const SOURCE_OPTIONS = [
  "Referral", "Google", "Facebook", "Door Hanger", "Yard Sign",
  "Direct Mail", "Website", "Phone Call", "Other",
];

const CLOSE_REASONS = ["Price", "No response", "Went with competitor", "Not ready", "Out of service area", "Other"];

// ── New lead dialog ───────────────────────────────────────────────────────────

function NewLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { mutateAsync: createLead, isPending } = useCreateLead();
  const router = useRouter();

  const [form, setForm] = useState({
    displayName: "", accountType: "residential", primaryPhone: "", primaryEmail: "", source: "",
  });

  function patch(k: keyof typeof form, v: string) { setForm((p) => ({ ...p, [k]: v })); }
  function reset() { setForm({ displayName: "", accountType: "residential", primaryPhone: "", primaryEmail: "", source: "" }); }

  async function submit() {
    if (!form.displayName.trim()) { toast.error("Name is required"); return; }
    try {
      const lead = await createLead({
        displayName: form.displayName.trim(),
        accountType: form.accountType,
        primaryPhone: form.primaryPhone,
        primaryEmail: form.primaryEmail,
        source: form.source,
      });
      toast.success("Lead created");
      reset();
      onOpenChange(false);
      router.push(`/crm/clients/${lead.id}`);
    } catch { toast.error("Failed to create lead"); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-500 -mt-1">Enter the basics — add address and jobs after saving.</p>
        <div className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-1.5">
            <Label>Name <span className="text-red-500">*</span></Label>
            <Input value={form.displayName} onChange={(e) => patch("displayName", e.target.value)} placeholder="Full name or company" autoFocus onKeyDown={(e) => e.key === "Enter" && void submit()} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Account Type</Label>
              <Select value={form.accountType} onValueChange={(v) => patch("accountType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="residential">Residential</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => patch("source", v)}>
                <SelectTrigger><SelectValue placeholder="How found?" /></SelectTrigger>
                <SelectContent>{SOURCE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <PhoneInput value={form.primaryPhone} onChange={(v) => patch("primaryPhone", v)} placeholder="(555) 000-0000" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.primaryEmail} onChange={(e) => patch("primaryEmail", e.target.value)} placeholder="name@email.com" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={isPending}>
            {isPending ? "Creating…" : "Save & Add Details →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Convert dialog ────────────────────────────────────────────────────────────

function ConvertDialog({ lead, open, onOpenChange }: { lead: Client; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { mutateAsync: convert, isPending } = useConvertLeadToClient();

  async function confirm() {
    try {
      await convert(lead.id);
      toast.success(`${lead.displayName} converted to client`);
      onOpenChange(false);
      router.push(`/crm/clients/${lead.id}`);
    } catch { toast.error("Failed to convert"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Convert to Client</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">
          Convert <span className="font-medium">{lead.displayName}</span> to an active client?
          They will appear in the Clients list and can be scheduled for jobs and invoiced.
        </p>
        {lead.revenuePotentialCents > 0 && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
            Revenue potential: <strong>{formatCurrency(lead.revenuePotentialCents)}/yr</strong>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void confirm()} disabled={isPending}>
            <UserCheck className="mr-1.5 h-4 w-4" />
            {isPending ? "Converting…" : "Convert to Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Close lead dialog ─────────────────────────────────────────────────────────

function CloseLeadDialog({ lead, open, onOpenChange }: { lead: Client; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { mutateAsync: close, isPending } = useCloseLeadAsLost();
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");

  async function confirm() {
    const finalReason = reason === "__custom__" ? custom.trim() : reason;
    if (!finalReason) { toast.error("Select a reason"); return; }
    try {
      await close({ clientId: lead.id, reason: finalReason });
      toast.success(`${lead.displayName} closed as lost`);
      onOpenChange(false);
    } catch { toast.error("Failed to close lead"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Close Lead — Lost</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">Mark <span className="font-medium">{lead.displayName}</span> as lost. They will move to inactive status and no longer appear in the active leads list.</p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Reason <span className="text-red-500">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Why are they lost?" /></SelectTrigger>
              <SelectContent>
                {CLOSE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                <SelectItem value="__custom__">Other…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {reason === "__custom__" && (
            <Input placeholder="Describe reason…" value={custom} onChange={(e) => setCustom(e.target.value)} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={isPending}>
            {isPending ? "Closing…" : "Close as Lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main list ─────────────────────────────────────────────────────────────────

const ACCOUNT_COLOR: Record<string, string> = {
  residential: "bg-blue-100 text-blue-700",
  commercial:  "bg-purple-100 text-purple-700",
};

interface LeadsListProps {
  newDialogOpen?: boolean;
  onNewDialogOpenChange?: (o: boolean) => void;
  onSelect?: (lead: Client) => void;
}

export function LeadsList({ newDialogOpen, onNewDialogOpenChange, onSelect }: LeadsListProps = {}) {
  const { data: leads, isLoading } = useLeads();
  const [search, setSearch] = useState("");
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const [convertLead, setConvertLead] = useState<Client | undefined>();
  const [closeLead, setCloseLead] = useState<Client | undefined>();

  const controlled = newDialogOpen !== undefined;
  const dialogOpen = controlled ? newDialogOpen : internalDialogOpen;
  function setDialogOpen(o: boolean) {
    if (controlled) onNewDialogOpenChange?.(o);
    else setInternalDialogOpen(o);
  }

  const filtered = (leads ?? []).filter((l) =>
    !search ||
    l.displayName.toLowerCase().includes(search.toLowerCase()) ||
    (l.primaryPhone ?? "").includes(search) ||
    (l.primaryEmail ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (l.billingCity ?? "").toLowerCase().includes(search.toLowerCase())
  );


  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search leads…" className="h-8 pl-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>{isLoading ? "…" : `${filtered.length} lead${filtered.length !== 1 ? "s" : ""}`}</span>
        </div>
        {!controlled && (
          <div className="ml-auto">
            <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Lead
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="min-w-[180px] px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3 text-right">Potential/yr</th>
              <th className="px-4 py-3">Date Added</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 9 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-sm text-slate-400">
                  {search ? "No leads match your search" : "No leads yet — add your first lead"}
                </td>
              </tr>
            ) : (
              filtered.map((lead) => (
                <tr
                  key={lead.id}
                  className={cn("group border-b hover:bg-slate-50", onSelect && "cursor-pointer")}
                  onClick={() => onSelect?.(lead)}
                >
                  <td className="px-4 py-2.5">
                    <button
                      className="font-medium text-brand-600 hover:underline text-left"
                      onClick={(e) => { e.stopPropagation(); onSelect?.(lead); }}
                    >
                      {lead.displayName}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", ACCOUNT_COLOR[lead.accountType] ?? "bg-slate-100 text-slate-500")}>
                      {lead.accountType}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{lead.primaryPhone ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{lead.primaryEmail ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {[lead.serviceAddress, lead.serviceCity, lead.serviceState].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{lead.source ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <LeadRevenuePotential leadId={lead.id} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {lead.clientSince
                      ? new Date(lead.clientSince + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); setConvertLead(lead); }}>
                        <UserCheck className="h-3 w-3" /> Convert
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px] text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); setCloseLead(lead); }}>
                        <XCircle className="h-3 w-3" /> Close
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <NewLeadDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      {convertLead && <ConvertDialog lead={convertLead} open={!!convertLead} onOpenChange={(o) => { if (!o) setConvertLead(undefined); }} />}
      {closeLead && <CloseLeadDialog lead={closeLead} open={!!closeLead} onOpenChange={(o) => { if (!o) setCloseLead(undefined); }} />}
    </div>
  );
}
