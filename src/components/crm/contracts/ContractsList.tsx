"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useContracts,
  useCreateContract,
  useUpdateContract,
  useUpdateContractStatus,
  useDeleteContract,
  useContractNotes,
  useCreateContractNote,
  useDeleteContractNote,
  useGenerateContractInvoices,
} from "@/lib/hooks/use-contracts";
import { useClients } from "@/lib/hooks/use-clients";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { useEmployees } from "@/lib/hooks/use-employees";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { ClientCombobox } from "@/components/shared/ClientCombobox";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { cn, formatCurrency } from "@/lib/utils";
import { Plus, Pencil, ChevronDown, Trash2, X, ArrowUp, ArrowDown, Search } from "lucide-react";
import { toast } from "sonner";
import type { CRMContract, MonthlyAmounts, ContractStatus } from "@/types/crm-invoices";

const CONTRACT_STATUSES: ContractStatus[] = ["draft", "sent", "signed", "active", "expired", "cancelled"];

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

// ── section card (matches Edit Employee's dark title bar over a bordered box) ─

function Section({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 rounded border last:mb-0", className)}>
      <div className="rounded-t-md bg-[#5a5a5a] px-4 py-2 text-sm font-semibold text-white">
        {label}
      </div>
      <div className="p-4">{children}</div>
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

// ── money input — keeps a local text buffer while focused so a re-render
//    from the formatted-cents value never fights an in-progress keystroke
//    (the previous controlled `(cents/100).toFixed(2)` value reformatted on
//    every character, which is why e.g. typing "25" could land on "2.01") ──

function MoneyInput({
  cents,
  onCommit,
  className,
}: {
  cents: number;
  onCommit: (cents: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(() => (cents / 100).toFixed(2));
  const [focused, setFocused] = useState(false);

  const displayValue = focused ? text : (cents / 100).toFixed(2);

  return (
    <Input
      type="text"
      inputMode="decimal"
      className={className}
      value={displayValue}
      onFocus={() => setText((cents / 100).toFixed(2))}
      onChange={(e) => { setFocused(true); setText(e.target.value); }}
      onBlur={() => {
        setFocused(false);
        onCommit(Math.round((parseFloat(text) || 0) * 100));
      }}
    />
  );
}

// ── contract details tab ──────────────────────────────────────────────────────

interface DetailsState {
  clientId: string;
  title: string;
  startDate: string;
  endDate: string;
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

  function addLineItem(name: string) {
    const s = name.trim();
    if (!s) return;
    onChange({ lineItems: [...state.lineItems, s] });
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
      <div className="mb-4 grid grid-cols-2 gap-4">
        <Section label="Client" className="mb-0">
          {!hideClient && (
            <FieldRow label="Client">
              <ClientCombobox
                clients={clients}
                value={state.clientId}
                onValueChange={(v) => onChange({ clientId: v })}
                noneLabel="Search clients…"
              />
            </FieldRow>
          )}
          <FieldRow label="Contract Name">
            <Input
              className="h-8 text-sm"
              value={state.title}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </FieldRow>
        </Section>

        <Section label="Contract Start & End Date" className="mb-0">
          <FieldRow label="Start Date">
            <Input type="date" className="h-8 w-44 text-sm" value={state.startDate} onChange={(e) => onChange({ startDate: e.target.value })} />
          </FieldRow>
          <FieldRow label="End Date">
            <Input type="date" className="h-8 w-44 text-sm" value={state.endDate} onChange={(e) => onChange({ endDate: e.target.value })} />
          </FieldRow>
        </Section>
      </div>

      <Section label="Invoice Description">
        <FieldRow label="Line Item">
          <ServiceLineItemPicker onAdd={addLineItem} />
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
      </Section>

      <Section label="Invoice Details">
        <div className="grid grid-cols-[1fr_1fr_260px] gap-x-6 gap-y-2">
          {/* Left months */}
          <div className="flex flex-col gap-2">
            {monthsLeft.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-sm text-slate-600">{label}</span>
                <MoneyInput
                  className="h-7 w-28 text-sm"
                  cents={state.monthlyAmounts[key] ?? 0}
                  onCommit={(cents) => onChange({
                    monthlyAmounts: { ...state.monthlyAmounts, [key]: cents },
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
                <MoneyInput
                  className="h-7 w-28 text-sm"
                  cents={state.monthlyAmounts[key] ?? 0}
                  onCommit={(cents) => onChange({
                    monthlyAmounts: { ...state.monthlyAmounts, [key]: cents },
                  })}
                />
              </div>
            ))}
          </div>
          {/* Right-side settings */}
          <div className="flex flex-col gap-2 pl-4 border-l border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-600">Billing Day of Month</span>
              <Input
                type="number"
                min={1} max={31}
                className="h-7 w-16 text-sm"
                value={state.billingDayOfMonth}
                onChange={(e) => onChange({ billingDayOfMonth: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-600">Bill 1 Month in Advance</span>
              <Checkbox
                checked={state.billMonthInAdvance}
                onCheckedChange={(v) => onChange({ billMonthInAdvance: !!v })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-600">Payment Type</span>
              <Select value={state.paymentType} onValueChange={(v) => onChange({ paymentType: v })}>
                <SelectTrigger className="h-7 w-32 shrink-0 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-600">PO Number</span>
              <Input className="h-7 w-32 shrink-0 text-sm" value={state.poNumber} onChange={(e) => onChange({ poNumber: e.target.value })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-600">Auto Generate</span>
              <Checkbox checked={state.autoGenerate} onCheckedChange={(v) => onChange({ autoGenerate: !!v })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-600">Active</span>
              <Checkbox checked={state.isActive} onCheckedChange={(v) => onChange({ isActive: !!v })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-600">Include Sub Properties by Default</span>
              <Checkbox checked={state.includeSubProperties} onCheckedChange={(v) => onChange({ includeSubProperties: !!v })} />
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ── searchable "line item" picker — pulls from the services catalog instead
//    of accepting arbitrary free text ──────────────────────────────────────

function ServiceLineItemPicker({ onAdd }: { onAdd: (name: string) => void }) {
  const { data: services } = useCRMServices();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customText, setCustomText] = useState("");

  const lc = search.toLowerCase();
  const filtered = (services ?? []).filter((s) =>
    s.isActive && (!lc || s.name.toLowerCase().includes(lc))
  );

  function pick(name: string) {
    onAdd(name);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSearch(""); setCustomText(""); } }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Line Item
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b px-2 py-1.5">
          <Input
            autoFocus
            placeholder="Search services…"
            className="h-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length > 0 ? (
            filtered.map((s) => (
              <button
                key={s.id}
                className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-50"
                onClick={() => pick(s.name)}
              >
                <span className="font-medium text-slate-900">{s.name}</span>
                {!!s.defaultRateCents && s.defaultRateCents > 0 && (
                  <span className="ml-2 shrink-0 text-[10px] text-slate-400">
                    {formatCurrency(s.defaultRateCents)}
                  </span>
                )}
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-xs text-slate-400">
              {lc ? `No services matching “${search}”` : "No services found"}
            </div>
          )}
        </div>
        <div className="flex gap-1.5 border-t p-1.5">
          <Input
            placeholder="Or type a custom line…"
            className="h-7 text-xs"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && customText.trim()) { pick(customText); setCustomText(""); } }}
          />
          <Button
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={!customText.trim()}
            onClick={() => { pick(customText); setCustomText(""); }}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── other details tab ─────────────────────────────────────────────────────────

function OtherDetailsTab({
  source, salesRepId, salesRepName,
  onChange,
}: {
  source: string;
  salesRepId: string;
  salesRepName?: string | null;
  onChange: (patch: { source?: string; salesRepId?: string }) => void;
}) {
  const { data: employees } = useEmployees();
  const salesReps = (employees ?? []).filter((e) => e.isSalesRep && e.userId);

  return (
    <div>
      <Section label="Client Source">
        <FieldRow label="Source">
          <Select value={source} onValueChange={(v) => onChange({ source: v })}>
            <SelectTrigger className="h-8 w-64 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldRow>
      </Section>
      <Section label="Sales Person">
        <FieldRow label="Sales Person">
          <Select value={salesRepId} onValueChange={(v) => onChange({ salesRepId: v })}>
            <SelectTrigger className="h-8 w-64 text-sm"><SelectValue placeholder="Assign sales rep…" /></SelectTrigger>
            <SelectContent>
              {salesReps.map((e) => (
                <SelectItem key={e.userId as string} value={e.userId as string}>
                  {e.firstName} {e.lastName}
                </SelectItem>
              ))}
              {salesRepId && !salesReps.some((e) => e.userId === salesRepId) && (
                <SelectItem value={salesRepId}>{salesRepName ?? "Unknown"}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </FieldRow>
      </Section>
    </div>
  );
}

// ── jobs under contract tab ───────────────────────────────────────────────────

function JobsUnderContractTab({ contractId }: { contractId?: string }) {
  if (!contractId) {
    return (
      <Section label="Scheduled Services">
        <p className="text-sm text-slate-400">Save the contract first to assign jobs.</p>
      </Section>
    );
  }
  return (
    <Section label="Scheduled Services">
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
    </Section>
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

export function ContractDialog({
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
  const [salesRepId, setSalesRepId] = useState(contract?.salesRepId ?? "");

  const { mutateAsync: createContract, isPending: creating } = useCreateContract();
  const { mutateAsync: updateContract, isPending: updating } = useUpdateContract();
  const { mutateAsync: updateStatus } = useUpdateContractStatus();
  const isPending = creating || updating;

  async function handleStatusChange(status: ContractStatus) {
    if (!contract) return;
    try {
      await updateStatus({ id: contract.id, status });
      toast.success(`Contract marked as ${status}`);
    } catch { toast.error("Failed to update contract status"); }
  }

  function patchDetails(patch: Partial<DetailsState>) {
    setDetails((prev) => ({ ...prev, ...patch }));
  }

  async function save() {
    if (!details.clientId || !details.title) {
      toast.error("Client and contract name are required");
      return;
    }
    if (details.lineItems.length === 0) {
      toast.error("At least one invoice line item is required");
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
          salesRepId: salesRepId || undefined,
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
            sales_rep_id: salesRepId || null,
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
      <DialogContent className="flex h-[85vh] w-full max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-xl font-bold">
              {isNew ? "New Contract" : contract.title}
            </DialogTitle>
            {!isNew && (
              <Select value={contract.status} onValueChange={(v) => handleStatusChange(v as ContractStatus)}>
                <SelectTrigger className={cn("h-6 w-auto gap-1 rounded-full border-none px-2 py-0 text-[10px] font-medium capitalize", STATUS_COLOR[contract.status])}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {/* Tab bar — wraps instead of scrolling so the mouse wheel never has to
              choose between scrolling tabs sideways and the dialog vertically */}
          <div className="flex flex-wrap gap-x-1 gap-y-0 pt-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "border-b-2 px-3 py-1.5 text-sm font-medium transition-colors",
                  activeTab === t.id
                    ? "border-brand-500 text-brand-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4">
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
              salesRepId={salesRepId}
              salesRepName={contract?.salesRepName}
              onChange={(p) => {
                if (p.source !== undefined) setSource(p.source);
                if (p.salesRepId !== undefined) setSalesRepId(p.salesRepId);
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
            <AttachmentsSection recordType="contract" recordId={contract.id} />
          )}
          {activeTab === "audit" && contract && (
            <AuditTrailTab recordType="contract" recordId={contract.id} />
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
  const { mutateAsync: generateInvoices, isPending: generatingInvoices } = useGenerateContractInvoices();

  const baseContracts = (contracts ?? []);
  const filtered = baseContracts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      (c.clientName ?? "").toLowerCase().includes(q) ||
      (c.clientEmail ?? "").toLowerCase().includes(q) ||
      (c.clientPhone ?? "").includes(q) ||
      (c.poNumber ?? "").toLowerCase().includes(q)
    );
  });

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

  async function handleCreateInvoices() {
    const ids = selected.size > 0 ? [...selected] : filtered.map((c) => c.id);
    if (ids.length === 0) return;
    try {
      const results = await generateInvoices(ids);
      const created = results.filter((r) => r.status === "created").length;
      const skipped = results.length - created;
      if (created === 0) {
        toast.info(skipped === 1 ? "That contract was already billed this month" : "All selected contracts were already billed this month");
      } else {
        toast.success(`${created} invoice${created !== 1 ? "s" : ""} created${skipped > 0 ? `, ${skipped} skipped (already billed)` : ""}`);
      }
      const problems = results.filter((r) => r.status === "created" && r.reason);
      if (problems.length > 0) {
        toast.warning(`${problems.length} invoice${problems.length !== 1 ? "s" : ""} created with issues — check them: ${problems[0].reason}`);
      }
      clearSelection();
    } catch {
      toast.error("Failed to create invoices");
    }
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
      <div className="flex items-center gap-2 bg-[#4a4a4a] px-4 py-2">
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
            <DropdownMenuItem onSelect={handleCreateInvoices} disabled={generatingInvoices}>
              {generatingInvoices ? "Creating…" : "Create Invoices"}
            </DropdownMenuItem>
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
            className="h-7 w-56 pl-7 text-xs bg-white border-slate-200 focus-visible:ring-0"
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
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 border-b z-10">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 accent-brand-500"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={(e) => e.target.checked ? selectAll() : clearSelection()}
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
                  onClick={() => openEdit(c)}
                  className={cn(
                    "group cursor-pointer border-b hover:bg-slate-50",
                    selected.has(c.id) && "bg-brand-50"
                  )}
                >
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 accent-brand-500"
                      checked={selected.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                    />
                  </td>
                  <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openEdit(c)}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  {!clientId && visibleKeys.includes("client") && (
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Link href={`/crm/clients/${c.clientId}`} className="font-medium text-brand-600 hover:underline">
                        {c.clientName ?? "—"}
                      </Link>
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
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
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
        key={editContract?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditContract(undefined); }}
        contract={editContract}
        defaultClientId={clientId}
        clients={clients ?? []}
      />
    </div>
  );
}
