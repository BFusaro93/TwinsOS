"use client";

import { useState, useRef } from "react";
import {
  useContracts,
  useCreateContract,
  useUpdateContract,
  useUpdateContractStatus,
  useDeleteContract,
  useContractNotes,
  useCreateContractNote,
  useDeleteContractNote,
} from "@/lib/hooks/use-contracts";
import { useClients } from "@/lib/hooks/use-clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/PageHeader";
import { ColumnChooser } from "@/components/shared/ColumnChooser";
import type { ColumnDef } from "@/components/shared/ColumnChooser";
import { cn, formatCurrency } from "@/lib/utils";
import { Plus, Pencil, ChevronDown, Trash2, X, ArrowUp, ArrowDown, Upload, Search } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { CRMContract, MonthlyAmounts } from "@/types/crm-invoices";

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  draft:     "bg-slate-100 text-slate-600",
  sent:      "bg-blue-100 text-blue-700",
  signed:    "bg-purple-100 text-purple-700",
  active:    "bg-green-100 text-green-700",
  expired:   "bg-yellow-100 text-yellow-700",
  cancelled: "bg-red-100 text-red-600",
};

const MONTHS: { key: keyof MonthlyAmounts; label: string }[] = [
  { key: "jan", label: "January" },
  { key: "feb", label: "February" },
  { key: "mar", label: "March" },
  { key: "apr", label: "April" },
  { key: "may", label: "May" },
  { key: "jun", label: "June" },
  { key: "jul", label: "July" },
  { key: "aug", label: "August" },
  { key: "sep", label: "September" },
  { key: "oct", label: "October" },
  { key: "nov", label: "November" },
  { key: "dec", label: "December" },
];

const PAYMENT_TYPES = ["Check", "Cash", "Credit Card", "ACH", "Invoice", "Online"];

const SOURCE_OPTIONS = [
  "Referral", "Google", "Facebook", "Door Hanger", "Yard Sign",
  "Direct Mail", "Website", "Other",
];

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "numeric", day: "numeric", year: "numeric",
  });
}

// ── section header (SA-style dark bar) ────────────────────────────────────────

function SectionBar({ label }: { label: string }) {
  return (
    <div className="mb-3 mt-4 rounded bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white first:mt-0">
      {label}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 grid grid-cols-[160px_1fr] items-start gap-3">
      <span className="pt-2 text-sm text-slate-700">{label}</span>
      <div>{children}</div>
    </div>
  );
}

// ── contract details tab ──────────────────────────────────────────────────────

interface DetailsState {
  clientId: string;
  title: string;
  startDate: string;
  endDate: string;
  lineItemInput: string;
  lineItems: string[];
  defaultService: string;
  monthlyAmounts: MonthlyAmounts;
  billingDayOfMonth: number;
  billMonthInAdvance: boolean;
  paymentType: string;
  poNumber: string;
  autoGenerate: boolean;
  isActive: boolean;
  includeSubProperties: boolean;
}

function ContractDetailsTab({
  state,
  onChange,
  hideClient,
  clients,
}: {
  state: DetailsState;
  onChange: (patch: Partial<DetailsState>) => void;
  hideClient?: boolean;
  clients: { id: string; displayName: string }[];
}) {
  function autoFill() {
    const v = state.monthlyAmounts.jan ?? 0;
    const filled: MonthlyAmounts = {};
    for (const m of MONTHS) filled[m.key] = v;
    onChange({ monthlyAmounts: filled });
  }

  function addLineItem() {
    const s = state.lineItemInput.trim();
    if (!s) return;
    onChange({ lineItems: [...state.lineItems, s], lineItemInput: "" });
  }

  function moveItem(i: number, dir: -1 | 1) {
    const arr = [...state.lineItems];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange({ lineItems: arr });
  }

  function removeItem(i: number) {
    onChange({ lineItems: state.lineItems.filter((_, idx) => idx !== i) });
  }

  const monthsLeft = MONTHS.slice(0, 6);
  const monthsRight = MONTHS.slice(6, 12);

  return (
    <div className="overflow-y-auto pr-1">
      {/* Client */}
      <SectionBar label="Client" />
      {!hideClient && (
        <FieldRow label="Client">
          <Select value={state.clientId} onValueChange={(v) => onChange({ clientId: v })}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Search Clients…" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      )}
      <FieldRow label="Contract Name">
        <Input
          className="h-8 text-sm"
          value={state.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </FieldRow>

      {/* Dates */}
      <SectionBar label="Contract Start & End Date" />
      <FieldRow label="Start Date">
        <Input type="date" className="h-8 w-44 text-sm" value={state.startDate} onChange={(e) => onChange({ startDate: e.target.value })} />
      </FieldRow>
      <FieldRow label="End Date">
        <Input type="date" className="h-8 w-44 text-sm" value={state.endDate} onChange={(e) => onChange({ endDate: e.target.value })} />
      </FieldRow>

      {/* Invoice Description */}
      <SectionBar label="Invoice Description" />
      <FieldRow label="Line Item">
        <div className="flex gap-1.5">
          <Input
            className="h-8 text-sm"
            value={state.lineItemInput}
            onChange={(e) => onChange({ lineItemInput: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addLineItem()}
            placeholder="Enter Line Item"
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={addLineItem}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </FieldRow>
      {state.lineItems.length > 0 && (
        <FieldRow label="Invoice Line Items">
          <div className="rounded border bg-slate-50 p-1.5">
            {state.lineItems.map((item, i) => (
              <div key={i} className="flex items-center gap-1 py-0.5 text-sm">
                <span className="flex-1 truncate">{item}</span>
                <button onClick={() => moveItem(i, -1)} className="p-0.5 text-slate-400 hover:text-slate-600"><ArrowUp className="h-3 w-3" /></button>
                <button onClick={() => moveItem(i, 1)} className="p-0.5 text-slate-400 hover:text-slate-600"><ArrowDown className="h-3 w-3" /></button>
                <button onClick={() => removeItem(i)} className="p-0.5 text-slate-400 hover:text-red-500"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        </FieldRow>
      )}

      {/* Invoice Details */}
      <SectionBar label="Invoice Details" />
      <div className="mb-3 grid grid-cols-[1fr_1fr_auto] gap-x-6 gap-y-2">
        {/* Left months */}
        <div className="flex flex-col gap-2">
          {monthsLeft.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-sm text-slate-600">{label}</span>
              <Input
                type="number"
                className="h-7 w-28 text-sm"
                value={((state.monthlyAmounts[key] ?? 0) / 100).toFixed(2)}
                onChange={(e) => onChange({
                  monthlyAmounts: { ...state.monthlyAmounts, [key]: Math.round(parseFloat(e.target.value || "0") * 100) },
                })}
              />
              {key === "jan" && (
                <button
                  className="text-xs font-semibold text-brand-600 hover:underline"
                  onClick={autoFill}
                >
                  Auto Fill
                </button>
              )}
            </div>
          ))}
        </div>
        {/* Right months */}
        <div className="flex flex-col gap-2">
          {monthsRight.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-sm text-slate-600">{label}</span>
              <Input
                type="number"
                className="h-7 w-28 text-sm"
                value={((state.monthlyAmounts[key] ?? 0) / 100).toFixed(2)}
                onChange={(e) => onChange({
                  monthlyAmounts: { ...state.monthlyAmounts, [key]: Math.round(parseFloat(e.target.value || "0") * 100) },
                })}
              />
            </div>
          ))}
        </div>
        {/* Right-side settings */}
        <div className="flex flex-col gap-2 pl-4 border-l border-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-36 text-sm text-slate-600">Billing Day of Month</span>
            <Input
              type="number"
              min={1} max={31}
              className="h-7 w-16 text-sm"
              value={state.billingDayOfMonth}
              onChange={(e) => onChange({ billingDayOfMonth: parseInt(e.target.value) || 1 })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-36 text-sm text-slate-600">Bill 1 Month in Advance</span>
            <Checkbox
              checked={state.billMonthInAdvance}
              onCheckedChange={(v) => onChange({ billMonthInAdvance: !!v })}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-36 text-sm text-slate-600">Payment Type</span>
            <Select value={state.paymentType} onValueChange={(v) => onChange({ paymentType: v })}>
              <SelectTrigger className="h-7 w-36 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-36 text-sm text-slate-600">PO Number</span>
            <Input className="h-7 w-36 text-sm" value={state.poNumber} onChange={(e) => onChange({ poNumber: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-36 text-sm text-slate-600">Auto Generate</span>
            <Checkbox checked={state.autoGenerate} onCheckedChange={(v) => onChange({ autoGenerate: !!v })} />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-36 text-sm text-slate-600">Active</span>
            <Checkbox checked={state.isActive} onCheckedChange={(v) => onChange({ isActive: !!v })} />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-36 text-sm text-slate-600">Include Sub Properties by Default</span>
            <Checkbox checked={state.includeSubProperties} onCheckedChange={(v) => onChange({ includeSubProperties: !!v })} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── other details tab ─────────────────────────────────────────────────────────

function OtherDetailsTab({
  source, salesRep,
  onChange,
}: {
  source: string;
  salesRep: string;
  onChange: (patch: { source?: string; salesRep?: string }) => void;
}) {
  return (
    <div>
      <SectionBar label="Client Source" />
      <FieldRow label="Source">
        <Select value={source} onValueChange={(v) => onChange({ source: v })}>
          <SelectTrigger className="h-8 w-64 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldRow>
      <SectionBar label="Sales Person" />
      <FieldRow label="Sales Person">
        <Input className="h-8 w-64 text-sm" value={salesRep} onChange={(e) => onChange({ salesRep: e.target.value })} placeholder="Name…" />
      </FieldRow>
    </div>
  );
}

// ── jobs under contract tab ───────────────────────────────────────────────────

function JobsUnderContractTab({ contractId }: { contractId?: string }) {
  if (!contractId) {
    return (
      <div>
        <SectionBar label="Scheduled Services" />
        <p className="py-4 text-sm text-slate-400">Save the contract first to assign jobs.</p>
      </div>
    );
  }
  return (
    <div>
      <SectionBar label="Scheduled Services" />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-semibold text-slate-500">
            <th className="py-2 pr-3">Jobs Under Contract</th>
            <th className="py-2 pr-3">Rate</th>
            <th className="py-2 pr-3">Schedule / Type</th>
            <th className="py-2 pr-3">Quantity</th>
            <th className="py-2">Contracted Hours</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={5} className="py-4 text-sm text-slate-400">
              No scheduled services on this contract yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── notes tab ─────────────────────────────────────────────────────────────────

function ContractNotesTab({ contractId }: { contractId?: string }) {
  const [body, setBody] = useState("");
  const { data: notes, isLoading } = useContractNotes(contractId ?? "");
  const { mutateAsync: addNote, isPending } = useCreateContractNote();
  const { mutateAsync: delNote } = useDeleteContractNote();

  if (!contractId) {
    return (
      <div>
        <p className="py-4 text-sm text-slate-400">Save the contract first to add notes.</p>
      </div>
    );
  }

  async function submit() {
    if (!body.trim()) return;
    try {
      await addNote({ contractId: contractId!, body: body.trim() });
      setBody("");
    } catch { toast.error("Failed to add note"); }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border bg-slate-50 p-2">
        {isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (notes ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">No notes yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold text-slate-500">
                <th className="pb-1 pr-4">Internal Note</th>
                <th className="pb-1 pr-4">Created</th>
                <th className="pb-1">Modified</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(notes ?? []).map((n) => (
                <tr key={n.id} className="group border-b last:border-0">
                  <td className="py-1.5 pr-4 text-slate-700">{n.body}</td>
                  <td className="py-1.5 pr-4 text-xs text-slate-400">{fmtDate(n.createdAt.slice(0, 10))}</td>
                  <td className="py-1.5 text-xs text-slate-400">{fmtDate(n.updatedAt.slice(0, 10))}</td>
                  <td className="py-1.5">
                    <button
                      onClick={() => delNote({ id: n.id, contractId: contractId! })}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex gap-2">
        <Textarea
          rows={2}
          className="text-sm"
          placeholder="Add a note…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button size="sm" onClick={submit} disabled={isPending || !body.trim()}>
          Add Note
        </Button>
      </div>
    </div>
  );
}

// ── attachments tab ───────────────────────────────────────────────────────────

function AttachmentsTab({ contractId }: { contractId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<{ name: string; date: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `contracts/${contractId}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("attachments").upload(path, file);
      if (error) throw error;
      setFiles((prev) => [...prev, { name: file.name, date: new Date().toLocaleDateString(), path }]);
      toast.success("Uploaded");
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function handleDelete(path: string) {
    const supabase = createClient();
    await supabase.storage.from("attachments").remove([path]);
    setFiles((prev) => prev.filter((f) => f.path !== path));
  }

  return (
    <div className="flex flex-col gap-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-slate-600 text-left text-xs font-semibold text-white">
            <th className="px-3 py-2">Attachment Name</th>
            <th className="px-3 py-2 w-16">Include</th>
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right">Date</th>
          </tr>
        </thead>
        <tbody>
          {files.length === 0 ? (
            <tr><td colSpan={4} className="py-4 text-center text-sm text-slate-400">No attachments</td></tr>
          ) : files.map((f) => (
            <tr key={f.path} className="group border-b hover:bg-slate-50">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => handleDelete(f.path)} className="text-red-500 opacity-0 group-hover:opacity-100">
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-brand-600 hover:underline cursor-pointer">{f.name}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-center">
                <Checkbox />
              </td>
              <td className="px-3 py-2 text-slate-400">—</td>
              <td className="px-3 py-2 text-right text-xs text-slate-500">{f.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </div>
  );
}

// ── contract dialog (new + edit) ──────────────────────────────────────────────

type TabId = "details" | "other" | "jobs" | "notes" | "attachments" | "audit";

const NEW_TABS: { id: TabId; label: string }[] = [
  { id: "details", label: "Contract Details" },
  { id: "other", label: "Other Details" },
  { id: "jobs", label: "Jobs Under Contract" },
  { id: "notes", label: "Contract Notes" },
];

const EDIT_TABS: { id: TabId; label: string }[] = [
  ...NEW_TABS,
  { id: "attachments", label: "Contract Attachments" },
  { id: "audit", label: "Audit Trail" },
];

function ContractDialog({
  open,
  onOpenChange,
  contract,
  defaultClientId,
  clients,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contract?: CRMContract;
  defaultClientId?: string;
  clients: { id: string; displayName: string }[];
}) {
  const isNew = !contract;
  const tabs = isNew ? NEW_TABS : EDIT_TABS;
  const [activeTab, setActiveTab] = useState<TabId>("details");

  const [details, setDetails] = useState<DetailsState>({
    clientId: contract?.clientId ?? defaultClientId ?? "",
    title: contract?.title ?? "",
    startDate: contract?.startDate ?? "",
    endDate: contract?.endDate ?? "",
    lineItemInput: "",
    lineItems: contract?.invoiceLineItems ?? [],
    defaultService: contract?.defaultService ?? "",
    monthlyAmounts: contract?.monthlyAmounts ?? {},
    billingDayOfMonth: contract?.billingDayOfMonth ?? 1,
    billMonthInAdvance: contract?.billMonthInAdvance ?? false,
    paymentType: contract?.paymentType ?? "",
    poNumber: contract?.poNumber ?? "",
    autoGenerate: contract?.autoGenerate ?? true,
    isActive: contract?.isActive ?? true,
    includeSubProperties: contract?.includeSubProperties ?? true,
  });

  const [source, setSource] = useState(contract?.source ?? "");
  const [salesRep, setSalesRep] = useState(contract?.salesRep ?? "");

  const { mutateAsync: createContract, isPending: creating } = useCreateContract();
  const { mutateAsync: updateContract, isPending: updating } = useUpdateContract();
  const isPending = creating || updating;

  function patchDetails(patch: Partial<DetailsState>) {
    setDetails((prev) => ({ ...prev, ...patch }));
  }

  async function save() {
    if (!details.clientId || !details.title) {
      toast.error("Client and contract name are required");
      return;
    }
    const totalCents = Object.values(details.monthlyAmounts).reduce((s, v) => s + (v ?? 0), 0);
    try {
      if (isNew) {
        await createContract({
          clientId: details.clientId,
          title: details.title,
          startDate: details.startDate || undefined,
          endDate: details.endDate || undefined,
          monthlyAmountCents: Math.round(totalCents / 12) || 0,
          billingDayOfMonth: details.billingDayOfMonth,
          billMonthInAdvance: details.billMonthInAdvance,
          paymentType: details.paymentType || undefined,
          poNumber: details.poNumber || undefined,
          autoGenerate: details.autoGenerate,
          isActive: details.isActive,
          includeSubProperties: details.includeSubProperties,
          source: source || undefined,
          salesRep: salesRep || undefined,
          monthlyAmounts: details.monthlyAmounts,
          invoiceLineItems: details.lineItems,
          defaultService: details.defaultService || undefined,
        });
        toast.success("Contract created");
      } else {
        await updateContract({
          id: contract!.id,
          updates: {
            client_id: details.clientId,
            title: details.title,
            start_date: details.startDate || null,
            end_date: details.endDate || null,
            monthly_amount_cents: Math.round(totalCents / 12) || 0,
            billing_day_of_month: details.billingDayOfMonth,
            bill_month_in_advance: details.billMonthInAdvance,
            payment_type: details.paymentType || null,
            po_number: details.poNumber || null,
            auto_generate: details.autoGenerate,
            is_active: details.isActive,
            include_sub_properties: details.includeSubProperties,
            source: source || null,
            sales_rep: salesRep || null,
            monthly_amounts: details.monthlyAmounts,
            invoice_line_items: details.lineItems,
            default_service: details.defaultService || null,
          },
        });
        toast.success("Contract saved");
      }
      onOpenChange(false);
    } catch { toast.error("Failed to save contract"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="text-xl font-bold">
            {isNew ? "New Contract" : contract.title}
          </DialogTitle>
          {/* Tab bar */}
          <div className="flex gap-0 pt-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "rounded-t px-4 py-1.5 text-sm font-medium transition-colors",
                  activeTab === t.id
                    ? "bg-slate-600 text-white"
                    : "text-brand-600 hover:text-brand-800"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === "details" && (
            <ContractDetailsTab
              state={details}
              onChange={patchDetails}
              hideClient={!!defaultClientId}
              clients={clients}
            />
          )}
          {activeTab === "other" && (
            <OtherDetailsTab
              source={source}
              salesRep={salesRep}
              onChange={(p) => {
                if (p.source !== undefined) setSource(p.source);
                if (p.salesRep !== undefined) setSalesRep(p.salesRep);
              }}
            />
          )}
          {activeTab === "jobs" && (
            <JobsUnderContractTab contractId={contract?.id} />
          )}
          {activeTab === "notes" && (
            <ContractNotesTab contractId={contract?.id} />
          )}
          {activeTab === "attachments" && contract && (
            <AttachmentsTab contractId={contract.id} />
          )}
          {activeTab === "audit" && (
            <div className="py-4 text-sm text-slate-400">Audit trail coming soon.</div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-center gap-3 border-t px-6 py-4">
          <Button onClick={save} disabled={isPending} className="min-w-24">
            {isPending ? "Saving…" : "Save"}
          </Button>
          <span className="text-sm text-slate-400">or</span>
          <button
            onClick={() => onOpenChange(false)}
            className="text-sm text-brand-600 hover:underline"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── column definitions ────────────────────────────────────────────────────────

const CONTRACT_COLUMNS: ColumnDef[] = [
  { key: "client",       label: "Client" },
  { key: "contract",     label: "Contract",    locked: true },
  { key: "status",       label: "Status" },
  { key: "billing_day",  label: "Billing Day" },
  { key: "amount",       label: "Amount" },
  { key: "start_date",   label: "Start Date" },
  { key: "end_date",     label: "End Date" },
  { key: "last_bill",    label: "Last Bill Date" },
];

// ── main list ─────────────────────────────────────────────────────────────────

interface Props { clientId?: string; }

type ActiveFilter = "active" | "inactive" | "all";

export function ContractsList({ clientId }: Props) {
  const [filter, setFilter] = useState<ActiveFilter>("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContract, setEditContract] = useState<CRMContract | undefined>();
  const [search, setSearch] = useState("");
  const [visibleKeys, setVisibleKeys] = useState<string[]>(
    CONTRACT_COLUMNS.map((c) => c.key)
  );

  const activeOnly = filter === "active" ? true : filter === "inactive" ? false : undefined;
  const { data: contracts, isLoading } = useContracts(clientId, activeOnly);
  const { data: clients } = useClients();
  const { mutateAsync: del } = useDeleteContract();
  const { mutateAsync: updateContract } = useUpdateContract();

  const baseContracts = (contracts ?? []);
  const filtered = baseContracts.filter((c) =>
    !search ||
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.clientName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered.map((c) => c.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function bulkSetActive(active: boolean) {
    const ids = selected.size > 0 ? [...selected] : filtered.map((c) => c.id);
    await Promise.all(ids.map((id) => updateContract({ id, updates: { is_active: active } })));
    toast.success(`${ids.length} contract${ids.length !== 1 ? "s" : ""} updated`);
    clearSelection();
  }

  async function handleDelete(c: CRMContract) {
    if (!confirm(`Delete "${c.title}"?`)) return;
    try { await del(c.id); toast.success("Deleted"); }
    catch { toast.error("Failed to delete"); }
  }

  function openNew() { setEditContract(undefined); setDialogOpen(true); }
  function openEdit(c: CRMContract) { setEditContract(c); setDialogOpen(true); }

  const allContracts = contracts ?? [];
  const counts = {
    active:   allContracts.filter((c) => c.isActive).length,
    inactive: allContracts.filter((c) => !c.isActive).length,
    all:      allContracts.length,
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Page header */}
      {!clientId && (
        <PageHeader
          title="Contracts"
          description={!isLoading ? `${allContracts.length} contracts` : "Service agreements and recurring billing"}
          action={
            <Button size="sm" onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Contract
            </Button>
          }
        />
      )}

      {/* Dark actions bar */}
      <div className="flex items-center gap-2 bg-[#3a3a3a] px-4 py-2">
        {/* Actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-7 bg-[#5a5a5a] border-[#6a6a6a] text-white hover:bg-[#6a6a6a] text-xs px-3"
            >
              Actions {selected.size > 0 && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">{selected.size}</span>
              )}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4} className="w-52 z-50">
            <DropdownMenuLabel className="text-xs text-slate-500">Actions</DropdownMenuLabel>
            <DropdownMenuItem onSelect={openNew}>Add Contract</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { setSearch(""); clearSelection(); }}>Clear Filters</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-slate-500">Active/Inactive</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => bulkSetActive(true)}>Make Active</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => bulkSetActive(false)}>Make Inactive</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-slate-500">Invoice/Export</DropdownMenuLabel>
            <DropdownMenuItem>Create Invoices</DropdownMenuItem>
            <DropdownMenuItem>Export</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Quick-filter tabs */}
        <div className="ml-2 flex items-center gap-1">
          {(["active", "inactive", "all"] as ActiveFilter[]).map((f) => {
            const label = f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1);
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                  filter === f ? "bg-white text-slate-800" : "text-slate-300 hover:text-white"
                )}
              >
                {label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  filter === f ? "bg-slate-200 text-slate-700" : "bg-white/20 text-white"
                )}>
                  {counts[f]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative ml-2">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-7 w-44 pl-7 text-xs bg-white border-slate-200 focus-visible:ring-0"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {clientId && (
            <Button size="sm" className="h-7 text-xs bg-[#5a5a5a] border-[#6a6a6a] text-white hover:bg-[#6a6a6a]" onClick={openNew}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Contract
            </Button>
          )}
          <ColumnChooser
            columns={clientId ? CONTRACT_COLUMNS.filter((c) => c.key !== "client") : CONTRACT_COLUMNS}
            visibleKeys={visibleKeys}
            onVisibleKeysChange={setVisibleKeys}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 border-b z-10">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="w-8 px-3 py-3">
                <Checkbox
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onCheckedChange={(v) => v ? selectAll() : clearSelection()}
                />
              </th>
              <th className="w-8 px-2 py-3" />
              {!clientId && visibleKeys.includes("client") && <th className="min-w-[160px] px-3 py-3">Client</th>}
              {visibleKeys.includes("contract") && <th className="min-w-[200px] px-3 py-3">Contract</th>}
              {visibleKeys.includes("status") && <th className="px-3 py-3">Status</th>}
              {visibleKeys.includes("billing_day") && <th className="px-3 py-3">Billing Day</th>}
              {visibleKeys.includes("amount") && <th className="px-3 py-3 text-right">Amount</th>}
              {visibleKeys.includes("start_date") && <th className="px-3 py-3">Start Date</th>}
              {visibleKeys.includes("end_date") && <th className="px-3 py-3">End Date</th>}
              {visibleKeys.includes("last_bill") && <th className="px-3 py-3">Last Bill Date</th>}
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: visibleKeys.length + 3 }).map((__, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={visibleKeys.length + 3} className="py-16 text-center text-sm text-slate-400">
                  No contracts found
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  className={cn(
                    "group border-b hover:bg-slate-50",
                    selected.has(c.id) && "bg-brand-50"
                  )}
                >
                  <td className="px-3 py-2.5">
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={() => toggleSelect(c.id)}
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => openEdit(c)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  {!clientId && visibleKeys.includes("client") && (
                    <td className="px-3 py-2.5 font-medium text-brand-600 hover:underline cursor-pointer">
                      {c.clientName ?? "—"}
                    </td>
                  )}
                  {visibleKeys.includes("contract") && (
                    <td className="px-3 py-2.5 font-medium text-slate-800">{c.title}</td>
                  )}
                  {visibleKeys.includes("status") && (
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                        STATUS_COLOR[c.status] ?? "bg-slate-100 text-slate-600"
                      )}>
                        {c.status}
                      </span>
                    </td>
                  )}
                  {visibleKeys.includes("billing_day") && (
                    <td className="px-3 py-2.5 text-sm text-slate-500">{ordinal(c.billingDayOfMonth)}</td>
                  )}
                  {visibleKeys.includes("amount") && (
                    <td className="px-3 py-2.5 text-right font-medium text-slate-700">
                      {c.monthlyAmountCents > 0 ? formatCurrency(c.monthlyAmountCents) : "—"}
                    </td>
                  )}
                  {visibleKeys.includes("start_date") && (
                    <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(c.startDate)}</td>
                  )}
                  {visibleKeys.includes("end_date") && (
                    <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(c.endDate)}</td>
                  )}
                  {visibleKeys.includes("last_bill") && (
                    <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(c.lastBilledDate)}</td>
                  )}
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => handleDelete(c)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Count */}
      <p className="text-xs text-slate-400">
        {isLoading ? "…" : `${filtered.length} contract${filtered.length !== 1 ? "s" : ""} found`}
      </p>

      <ContractDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditContract(undefined); }}
        contract={editContract}
        defaultClientId={clientId}
        clients={clients ?? []}
      />
    </div>
  );
}
