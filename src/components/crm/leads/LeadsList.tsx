"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLeads, useCreateLead, useConvertLeadToClient } from "@/lib/hooks/use-clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";
import { Plus, UserCheck, Search } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/types/crm";

// ── new lead dialog ───────────────────────────────────────────────────────────

const SOURCE_OPTIONS = [
  "Referral", "Google", "Facebook", "Door Hanger", "Yard Sign",
  "Direct Mail", "Website", "Phone Call", "Other",
];

function NewLeadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { mutateAsync: createLead, isPending } = useCreateLead();
  const router = useRouter();

  const [form, setForm] = useState({
    displayName: "",
    accountType: "residential",
    primaryPhone: "",
    primaryEmail: "",
    billingAddress: "",
    billingCity: "",
    billingState: "",
    billingZip: "",
    source: "",
  });

  function patch(k: keyof typeof form, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function submit() {
    if (!form.displayName.trim()) { toast.error("Name is required"); return; }
    try {
      const lead = await createLead({
        displayName: form.displayName.trim(),
        accountType: form.accountType,
        primaryPhone: form.primaryPhone,
        primaryEmail: form.primaryEmail,
        billingAddress: form.billingAddress,
        billingCity: form.billingCity,
        billingState: form.billingState,
        billingZip: form.billingZip,
        source: form.source,
      });
      toast.success("Lead created");
      onOpenChange(false);
      router.push(`/crm/clients/${lead.id}`);
    } catch { toast.error("Failed to create lead"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Lead</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Name *</Label>
              <Input
                value={form.displayName}
                onChange={(e) => patch("displayName", e.target.value)}
                placeholder="Full name or company name"
                autoFocus
              />
            </div>
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
                <SelectTrigger><SelectValue placeholder="How did they find you?" /></SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <Input
                type="tel"
                value={form.primaryPhone}
                onChange={(e) => patch("primaryPhone", e.target.value)}
                placeholder="(555) 000-0000"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.primaryEmail}
                onChange={(e) => patch("primaryEmail", e.target.value)}
                placeholder="name@email.com"
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Address</Label>
              <Input
                value={form.billingAddress}
                onChange={(e) => patch("billingAddress", e.target.value)}
                placeholder="Street address"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>City</Label>
              <Input value={form.billingCity} onChange={(e) => patch("billingCity", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>State</Label>
                <Input value={form.billingState} onChange={(e) => patch("billingState", e.target.value)} placeholder="NY" className="uppercase" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>ZIP</Label>
                <Input value={form.billingZip} onChange={(e) => patch("billingZip", e.target.value)} placeholder="10001" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "Creating…" : "Create Lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── convert confirm ───────────────────────────────────────────────────────────

function ConvertDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Client;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
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
        <DialogHeader>
          <DialogTitle>Convert to Client</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          Convert <span className="font-medium">{lead.displayName}</span> to an active client?
          They will appear in the Clients list and can be scheduled for jobs and invoiced.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={isPending}>
            <UserCheck className="mr-1.5 h-4 w-4" />
            {isPending ? "Converting…" : "Convert to Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── main list ─────────────────────────────────────────────────────────────────

const ACCOUNT_COLOR: Record<string, string> = {
  residential: "bg-blue-100 text-blue-700",
  commercial:  "bg-purple-100 text-purple-700",
};

interface LeadsListProps {
  newDialogOpen?: boolean;
  onNewDialogOpenChange?: (o: boolean) => void;
}

export function LeadsList({ newDialogOpen, onNewDialogOpenChange }: LeadsListProps = {}) {
  const { data: leads, isLoading } = useLeads();
  const [search, setSearch] = useState("");
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const [convertLead, setConvertLead] = useState<Client | undefined>();
  const router = useRouter();

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
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search leads…"
            className="h-8 pl-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-sm text-slate-400">
          {isLoading ? "…" : `${filtered.length} lead${filtered.length !== 1 ? "s" : ""}`}
        </span>
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
              <th className="px-4 py-3">Date Added</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                  {search ? "No leads match your search" : "No leads yet — add your first lead"}
                </td>
              </tr>
            ) : (
              filtered.map((lead) => (
                <tr
                  key={lead.id}
                  className="group border-b hover:bg-slate-50"
                >
                  <td className="px-4 py-2.5">
                    <button
                      className="font-medium text-brand-600 hover:underline text-left"
                      onClick={() => router.push(`/crm/clients/${lead.id}`)}
                    >
                      {lead.displayName}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                      ACCOUNT_COLOR[lead.accountType] ?? "bg-slate-100 text-slate-500"
                    )}>
                      {lead.accountType}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{lead.primaryPhone ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{lead.primaryEmail ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{lead.billingCity ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{lead.source ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {lead.clientSince
                      ? new Date(lead.clientSince + "T12:00:00").toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 gap-1 px-2 text-[11px] opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); setConvertLead(lead); }}
                    >
                      <UserCheck className="h-3 w-3" />
                      Convert
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <NewLeadDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {convertLead && (
        <ConvertDialog
          lead={convertLead}
          open={!!convertLead}
          onOpenChange={(o) => { if (!o) setConvertLead(undefined); }}
        />
      )}
    </div>
  );
}
