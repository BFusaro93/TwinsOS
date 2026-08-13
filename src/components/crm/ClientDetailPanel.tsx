"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useClient,
  useClients,
  useClientContacts,
  useClientProperties,
  useChildClients,
  useSetParentClient,
  useConvertLeadToClient,
  useUpdateClient,
  useAddClientContact,
  useUpdateClientContact,
  useDeleteClientContact,
  useAddClientProperty,
  useAddClientTag,
  useRemoveClientTag,
  useOrgTags,
  useCancelClient,
  useActivateClient,
} from "@/lib/hooks/use-clients";
import { TagEditor } from "@/components/crm/TagEditor";
import { useTicket } from "@/lib/hooks/use-tickets";
import { useClientJobs, useUpdateJobStatus, useJobVisits, useClientAllVisits, useAllCRMServices } from "@/lib/hooks/use-crm-jobs";
import { useInvoices, usePayments, usePayment } from "@/lib/hooks/use-invoices";
import { useEstimates } from "@/lib/hooks/use-estimates";
import { useContracts } from "@/lib/hooks/use-contracts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { VisitStatusIcon } from "@/components/shared/VisitStatusIcon";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityTimeline } from "./ActivityTimeline";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { TicketDetailSheet } from "./tickets/TicketDetailSheet";
import { TicketsList, NewTicketDialog } from "./tickets/TicketsList";
import { NewEstimateDialog } from "./estimates/NewEstimateDialog";
import { EstimateDetailSheet } from "./estimates/EstimateDetailSheet";
import { JobDetailSheet } from "./jobs/JobDetailSheet";
import type { Tab } from "./jobs/JobDetail";
import { NewJobDialog } from "./jobs/NewJobDialog";
import { InvoiceDetailSheet } from "./invoices/InvoiceDetailSheet";
import { NewInvoiceSheet } from "./invoices/NewInvoiceSheet";
import { AddPaymentDialog, RefundDialog } from "./payments/PaymentsList";
import { ContractsList, ContractDialog } from "./contracts/ContractsList";
import { ClientFilesTab } from "./ClientFilesTab";
import { SendClientEmailDialog } from "./SendClientEmailDialog";
import { ClientProjectsTab } from "./ClientProjectsTab";
import { ClientPhotosTab } from "./ClientPhotosTab";
import { AerialMeasurementDialog } from "./AerialMeasurementDialog";
import {
  useCustomFieldDefs,
  useClientCustomFieldValues,
  useUpsertClientCustomFieldValue,
} from "@/lib/hooks/use-client-custom-fields";
import { useOrgList } from "@/lib/hooks/use-org-lists";
import { formatCurrency, formatDate } from "@/lib/utils";
import { computeActualHours } from "@/lib/utils/visit-hours";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import type { CRMPayment, CRMInvoice, CRMContract } from "@/types/crm-invoices";
import type { Estimate } from "@/types/crm-estimates";
import { toast } from "sonner";
import { useRequiredFields } from "@/lib/hooks/use-required-fields";
import {
  Phone,
  Mail,
  MapPin,
  Building2,
  Home,
  Plus,
  ChevronRight,
  UserCheck,
  UserCircle,
  Pencil,
  Eye,
  Send,
  ChevronDown,
  MoreHorizontal,
  Ticket,
  Map,
  Ban,
  CheckCircle,
  ClipboardList,
  History,
  Calendar,
  Maximize2,
  Minimize2,
  X,
  ExternalLink,
  Search,
} from "lucide-react";
import type { Client, ClientContact, ContactPhone, PhoneType } from "@/types/crm";
import type { CRMJob, CRMJobVisit, CRMJobService } from "@/types/crm-jobs";

// Contact types — configurable via Settings in a future sprint
const CONTACT_TYPES = [
  "Owner",
  "Primary",
  "Spouse",
  "Property Manager",
  "District Manager",
  "Trustee/Board Member",
  "Employee",
  "Child",
  "Other",
];

const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-100 text-green-700 border-green-200",
  inactive: "bg-slate-100 text-slate-500 border-slate-200",
  lead: "bg-yellow-100 text-yellow-700 border-yellow-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
  lost: "bg-orange-100 text-orange-700 border-orange-200",
};

function BalanceCard({ client, revenuePotentialCents }: { client: Client; revenuePotentialCents?: number }) {
  // A closed-lost lead never became a client either — show the same
  // Revenue Potential card as an open lead rather than an empty balance card.
  const isLeadLike = client.status === "lead" || client.status === "lost";

  if (isLeadLike) {
    return (
      <div className="relative ml-3">
        <div className="rounded-lg bg-[#4a4a4a] pr-3 pb-3 pl-3" style={{ paddingTop: "92px" }} />
        <div className="absolute top-3 -left-3 right-3 rounded-lg bg-brand-600 px-4 py-3 text-center shadow-md">
          <p className="text-xl font-bold tabular-nums text-white leading-tight">
            {formatCurrency(revenuePotentialCents ?? 0)}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/75 mt-0.5">
            Revenue Potential
          </p>
        </div>
      </div>
    );
  }

  const outstanding = client.balanceOutstandingCents;
  const uninvoiced  = client.balanceUninvoicedCents;
  const credits     = client.balanceCreditsCents;
  const prepay      = client.balancePrepaymentsCents;
  const isRed   = outstanding > 0;
  const isGreen = outstanding < 0;

  const pillBg = isRed ? "bg-red-500" : isGreen ? "bg-green-600" : "bg-gray-500";

  return (
    /*
     * The pill bleeds left (-ml-3) and upward (-mt-3) past the gray box edges.
     * The gray box uses a fixed paddingTop (76px) to reserve enough vertical
     * space for the pill so sub-rows are never clipped.
     * ml-3 + mt-3 on the wrapper create the bleed gutter.
     */
    <div className="relative ml-3">
      {/* Gray container — extends 12px above, right, and below the pill */}
      <div className="rounded-lg bg-[#4a4a4a] pr-3 pb-3 pl-3" style={{ paddingTop: "92px" }}>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-white/60">Uninvoiced</span>
            {uninvoiced > 0 ? (
              <Link
                href={`/crm/accounting/invoices?clientId=${client.id}&filter=uninvoiced`}
                className="font-medium text-amber-300 hover:underline"
                title="View this client's uninvoiced (draft) invoices"
              >
                {formatCurrency(uninvoiced)}
              </Link>
            ) : (
              <span className="text-white/40">$0.00</span>
            )}
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/60">Credits</span>
            <span className={credits > 0 ? "font-medium text-green-300" : "text-white/40"}>
              {credits > 0 ? formatCurrency(credits) : "$0.00"}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/60">Prepayments</span>
            <span className={prepay > 0 ? "font-medium text-blue-300" : "text-white/40"}>
              {prepay > 0 ? formatCurrency(prepay) : "$0.00"}
            </span>
          </div>
        </div>
      </div>
      {/* Colored pill — sits 12px inside the gray top (matches right gap), bleeds 12px left */}
      <div className={`absolute top-3 -left-3 right-3 rounded-lg ${pillBg} px-4 py-3 text-center shadow-md`}>
        <p className="text-xl font-bold tabular-nums text-white leading-tight">
          {isGreen ? "−" : ""}{formatCurrency(Math.abs(outstanding))}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/75 mt-0.5">
          {isRed ? "Balance Due" : isGreen ? "Credit" : "Current"}
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

// ── PaymentDetailDialog ───────────────────────────────────────────────────────

function PaymentDetailDialog({
  payment,
  onClose,
}: {
  payment: CRMPayment | null;
  onClose: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const { data: invoices } = useInvoices(payment?.clientId ?? undefined);

  // All invoices with any amount paid — best approximation of what this payment touched
  const paidInvoices = useMemo(
    () => (invoices ?? []).filter((inv) => inv.amountPaidCents > 0 && inv.status !== "void"),
    [invoices]
  );

  if (!payment && !editOpen && !refundOpen) return null;
  return (
    <>
      <Dialog open={!!payment && !editOpen && !refundOpen} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          {payment && (
            <div className="text-sm space-y-3 py-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Amount</span>
                <span className="font-semibold text-green-600">{formatCurrency(payment.amountCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date</span>
                <span>{new Date(payment.paymentDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Method</span>
                <span>{payment.method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Reference / Check #</span>
                <span>{payment.reference || <span className="text-slate-300">—</span>}</span>
              </div>
              {paidInvoices.length > 0 && (
                <div className="flex justify-between items-start">
                  <span className="text-slate-400 shrink-0">Applied to</span>
                  <span className="text-right">
                    {paidInvoices.map((inv) => (
                      <span key={inv.id} className="block">
                        #{inv.invoiceNumber} &mdash; {formatCurrency(inv.amountPaidCents)}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {payment.memo && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Memo</span>
                  <span className="text-right max-w-[180px]">{payment.memo}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>Edit</Button>
            <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setRefundOpen(true)}>Refund</Button>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddPaymentDialog
        open={editOpen}
        onOpenChange={(o) => { if (!o) { setEditOpen(false); onClose(); } }}
        payment={payment}
      />

      <RefundDialog
        payment={refundOpen ? payment : null}
        onClose={() => { setRefundOpen(false); onClose(); }}
      />
    </>
  );
}

// ── CancelClientDialog ────────────────────────────────────────────────────────

const CANCEL_REASONS = ["Price", "Moved", "Unhappy with service", "No longer needs service", "Other"];

function CancelClientDialog({ clientId, clientName, open, onOpenChange }: {
  clientId: string; clientName: string; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const { mutateAsync: cancel, isPending } = useCancelClient();
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");

  async function confirm() {
    const finalReason = reason === "Other" ? custom.trim() : reason;
    if (!finalReason) { toast.error("Select a cancellation reason"); return; }
    try {
      await cancel({ clientId, reason: finalReason });
      toast.success(`${clientName} cancelled`);
      onOpenChange(false);
    } catch { toast.error("Failed to cancel client"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Cancel Client</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-600">
          Cancel <span className="font-medium">{clientName}</span>? A cancellation reason is required for reporting.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Reason <span className="text-red-500">*</span></label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select reason…" /></SelectTrigger>
              <SelectContent>
                {CANCEL_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {reason === "Other" && (
            <input
              className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
              placeholder="Describe reason…"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={isPending}>
            {isPending ? "Cancelling…" : "Cancel Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── EditClientDialog ──────────────────────────────────────────────────────────

export const PAYMENT_METHOD_OPTIONS = [
  { value: "ACH/E-Check",           label: "ACH / E-Check" },
  { value: "AutoPay",               label: "AutoPay" },
  { value: "Cash",                  label: "Cash" },
  { value: "Check",                 label: "Check" },
  { value: "Credit Card- AmEx",     label: "Credit Card (AmEx)" },
  { value: "Credit Card- Discover", label: "Credit Card (Discover)" },
  { value: "Credit Card- MasterCard", label: "Credit Card (MC)" },
  { value: "Credit Card- Visa",     label: "Credit Card (Visa)" },
  { value: "Other",                 label: "Other" },
];

export function EditClientDialogExport({ client, open, onOpenChange }: { client: Client; open: boolean; onOpenChange: (o: boolean) => void }) {
  return <EditClientDialog client={client} open={open} onOpenChange={onOpenChange} />;
}

function ClientCombobox({
  value,
  onChange,
  onSelectId,
  clients,
  placeholder = "Search clients or type name…",
}: {
  value: string;
  onChange: (v: string) => void;
  /** Called with a client's id when picked from the list, or null once the
   * text no longer matches that pick (free text — no real client link). */
  onSelectId?: (id: string | null) => void;
  clients: Client[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  // Show all clients on focus; filter when user types
  const filtered = open
    ? query.trim().length > 0
      ? clients.filter((c) => c.displayName.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
      : clients.slice(0, 10)
    : [];

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <Input
        className="pl-8"
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); onSelectId?.(null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg text-sm max-h-52 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
              onMouseDown={() => { setQuery(c.displayName); onChange(c.displayName); onSelectId?.(c.id); setOpen(false); }}
            >
              <span>{c.displayName}</span>
              {c.status === "lead" && (
                <span className="text-xs text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">Lead</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


function EditClientDialog({ client, open, onOpenChange }: { client: Client; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { mutateAsync: update, isPending } = useUpdateClient();
  const rf = useRequiredFields("client");
  const { data: fieldDefs = [] } = useCustomFieldDefs();
  const { data: fieldValues = [], isLoading: fieldValuesLoading } = useClientCustomFieldValues(client.id);
  const { mutateAsync: upsertFieldValue } = useUpsertClientCustomFieldValue();
  const { data: allClients = [] } = useClients();
  const { data: sourcesOptions = [] } = useOrgList("client_sources");
  const { data: orgSettings } = useOrgSettings();

  const [editTab, setEditTab] = useState("personal");
  const [billingSameAsService, setBillingSameAsService] = useState(client.billingSameAsService ?? true);
  const [clientPhones, setClientPhones] = useState<ContactPhone[]>(
    client.phones?.length > 0
      ? client.phones
      : client.primaryPhone
        ? [{ phone: client.primaryPhone, type: "cell" as PhoneType, isPrimary: true }]
        : [{ phone: "", type: "cell" as PhoneType, isPrimary: true }]
  );

  function addClientPhone() {
    setClientPhones((prev) => [...prev, { phone: "", type: "cell" as PhoneType, isPrimary: false }]);
  }

  function removeClientPhone(idx: number) {
    setClientPhones((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0 && !next.some((p) => p.isPrimary)) next[0] = { ...next[0], isPrimary: true };
      return next;
    });
  }

  function patchClientPhone(idx: number, field: keyof ContactPhone, value: string | boolean) {
    setClientPhones((prev) => prev.map((p, i) => {
      if (i !== idx) return field === "isPrimary" && value ? { ...p, isPrimary: false } : p;
      return { ...p, [field]: value };
    }));
  }

  const [form, setForm] = useState({
    displayName: client.displayName,
    firstName: client.firstName ?? "",
    lastName: client.lastName ?? "",
    accountNumber: client.accountNumber ?? "",
    primaryPhone: client.primaryPhone ?? "",
    primaryEmail: client.primaryEmail ?? "",
    // service address
    serviceAddress: client.serviceAddress ?? "",
    serviceCity: client.serviceCity ?? "",
    serviceState: client.serviceState ?? "",
    serviceZip: client.serviceZip ?? "",
    // billing address (separate)
    billingAddress: client.billingAddress ?? "",
    billingCity: client.billingCity ?? "",
    billingState: client.billingState ?? "",
    billingZip: client.billingZip ?? "",
    billingEmail: client.billingEmail ?? "",
    source: client.source ?? "",
    referredBy: client.referredBy ?? "",
    referredByClientId: client.referredByClientId ?? null as string | null,
    paymentMethod: client.defaultPaymentMethod ?? client.paymentMethod ?? "",
    notesToCrew: client.notesToCrew ?? "",
    invoiceFrequency: client.invoiceFrequency,
    defaultTaxRateBps: client.defaultTaxRateBps,
    defaultTerms: client.defaultTerms,
    invoiceDelivery: client.invoiceDelivery ?? "email",
    accountType: client.accountType,
    priority: client.priority ?? "normal",
    clientSince: client.clientSince ?? "",
    isTaxable: client.isTaxable,
    doNotMarket: client.doNotMarket,
    officeNotes: client.officeNotes ?? "",
    // built-in takeoffs
    turfSqft: client.turfSqft != null ? String(client.turfSqft) : "",
    mulchBedSqft: client.mulchBedSqft != null ? String(client.mulchBedSqft) : "",
    grossSqft: client.grossSqft != null ? String(client.grossSqft) : "",
    linearFtPerimeter: client.linearFtPerimeter != null ? String(client.linearFtPerimeter) : "",
    linearFtEdging: client.linearFtEdging != null ? String(client.linearFtEdging) : "",
    yardsOfMulch: client.yardsOfMulch != null ? String(client.yardsOfMulch) : "",
    // gate code moved to Custom Fields tab
    gateCode: client.gateCode ?? "",
  });

  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  // Tracks which client's custom values we've already seeded, so a later
  // background refetch of fieldValues (e.g. window refocus) while the user
  // is mid-edit doesn't clobber their unsaved typing.
  const customValuesSyncedForRef = useRef<string | null>(null);

  // fieldValues loads asynchronously — seeding customValues from it via a
  // plain useState initializer only runs once on mount and would capture it
  // as still-empty if the dialog opens before the query resolves, silently
  // treating every custom field as blank. Wait for the fetch to actually
  // settle for this client before seeding, and only do it once per client.
  useEffect(() => {
    if (fieldValuesLoading) return;
    if (customValuesSyncedForRef.current === client.id) return;
    customValuesSyncedForRef.current = client.id;
    const map: Record<string, string> = {};
    fieldValues.forEach((v) => {
      map[v.fieldDefId] = v.valueNumber != null ? String(v.valueNumber) : (v.valueText ?? "");
    });
    setCustomValues(map);
  }, [client.id, fieldValuesLoading, fieldValues]);

  // Reset all form state when a different client is opened
  useEffect(() => {
    setEditTab("personal");
    setBillingSameAsService(client.billingSameAsService ?? true);
    setClientPhones(
      client.phones?.length > 0
        ? client.phones
        : client.primaryPhone
          ? [{ phone: client.primaryPhone, type: "cell" as PhoneType, isPrimary: true }]
          : [{ phone: "", type: "cell" as PhoneType, isPrimary: true }]
    );
    setForm({
      displayName: client.displayName,
      firstName: client.firstName ?? "",
      lastName: client.lastName ?? "",
      accountNumber: client.accountNumber ?? "",
      primaryPhone: client.primaryPhone ?? "",
      primaryEmail: client.primaryEmail ?? "",
      serviceAddress: client.serviceAddress ?? "",
      serviceCity: client.serviceCity ?? "",
      serviceState: client.serviceState ?? "",
      serviceZip: client.serviceZip ?? "",
      billingAddress: client.billingAddress ?? "",
      billingCity: client.billingCity ?? "",
      billingState: client.billingState ?? "",
      billingZip: client.billingZip ?? "",
      billingEmail: client.billingEmail ?? "",
      source: client.source ?? "",
      referredBy: client.referredBy ?? "",
      referredByClientId: client.referredByClientId ?? null,
      paymentMethod: client.defaultPaymentMethod ?? client.paymentMethod ?? "",
      notesToCrew: client.notesToCrew ?? "",
      invoiceFrequency: client.invoiceFrequency,
      defaultTaxRateBps: client.defaultTaxRateBps,
      defaultTerms: client.defaultTerms,
      invoiceDelivery: client.invoiceDelivery ?? "email",
      accountType: client.accountType,
      priority: client.priority ?? "normal",
      clientSince: client.clientSince ?? "",
      isTaxable: client.isTaxable,
      doNotMarket: client.doNotMarket,
      officeNotes: client.officeNotes ?? "",
      turfSqft: client.turfSqft != null ? String(client.turfSqft) : "",
      mulchBedSqft: client.mulchBedSqft != null ? String(client.mulchBedSqft) : "",
      grossSqft: client.grossSqft != null ? String(client.grossSqft) : "",
      linearFtPerimeter: client.linearFtPerimeter != null ? String(client.linearFtPerimeter) : "",
      linearFtEdging: client.linearFtEdging != null ? String(client.linearFtEdging) : "",
      yardsOfMulch: client.yardsOfMulch != null ? String(client.yardsOfMulch) : "",
      gateCode: client.gateCode ?? "",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  function patch(k: keyof typeof form, v: string | number | boolean | null) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSave() {
    if (rf.isRequired("source") && !form.source.trim()) {
      toast.error("Source is required");
      return;
    }
    try {
      const serviceAddr = {
        serviceAddress: form.serviceAddress || null,
        serviceCity: form.serviceCity || null,
        serviceState: form.serviceState || null,
        serviceZip: form.serviceZip || null,
      };
      const billingAddr = billingSameAsService
        ? { billingAddress: form.serviceAddress || null, billingCity: form.serviceCity || null, billingState: form.serviceState || null, billingZip: form.serviceZip || null }
        : { billingAddress: form.billingAddress || null, billingCity: form.billingCity || null, billingState: form.billingState || null, billingZip: form.billingZip || null };

      const validClientPhones = clientPhones.filter((p) => p.phone.trim());
      const primaryClientPhone = validClientPhones.find((p) => p.isPrimary) ?? validClientPhones[0] ?? null;

      await update({
        id: client.id,
        updates: {
          ...form,
          ...serviceAddr,
          ...billingAddr,
          billingSameAsService,
          phones: validClientPhones,
          primaryPhone: primaryClientPhone?.phone ?? null,
          firstName: form.firstName || null,
          lastName: form.lastName || null,
          accountNumber: form.accountNumber || null,
          // unified payment method — stored in both columns for compat
          paymentMethod: form.paymentMethod || null,
          defaultPaymentMethod: form.paymentMethod || null,
          billingTerms: null,
          mapCode: null,
          turfSqft: form.turfSqft !== "" ? parseFloat(form.turfSqft) : null,
          mulchBedSqft: form.mulchBedSqft !== "" ? parseFloat(form.mulchBedSqft) : null,
          grossSqft: form.grossSqft !== "" ? parseFloat(form.grossSqft) : null,
          linearFtPerimeter: form.linearFtPerimeter !== "" ? parseFloat(form.linearFtPerimeter) : null,
          linearFtEdging: form.linearFtEdging !== "" ? parseFloat(form.linearFtEdging) : null,
          yardsOfMulch: form.yardsOfMulch !== "" ? parseFloat(form.yardsOfMulch) : null,
        },
      });
    } catch {
      toast.error("Failed to update client");
      return;
    }

    // The main client fields already committed above — a failure here is a
    // separate, secondary problem, not a full save failure. Report it as
    // such instead of a generic "failed to update" that implies nothing saved.
    try {
      await Promise.all(
        fieldDefs.map((def) => {
          const raw = customValues[def.id] ?? "";
          return upsertFieldValue({
            clientId: client.id,
            fieldDefId: def.id,
            valueText: def.fieldType === "text" ? raw || null : null,
            valueNumber: def.fieldType === "number" && raw !== "" ? parseFloat(raw) : null,
          });
        })
      );
      toast.success("Client updated");
      onOpenChange(false);
    } catch {
      toast.error("Client details saved, but a custom field failed to save");
      onOpenChange(false);
    }
  }

  const tabClass = "rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-medium data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
          <DialogTitle>Edit Client — {client.displayName}</DialogTitle>
        </DialogHeader>

        <Tabs value={editTab} onValueChange={setEditTab} className="flex flex-col flex-1 min-h-0">
          <TabsList className="shrink-0 justify-start rounded-none border-b bg-white px-6 h-10 gap-1">
            <TabsTrigger value="personal" className={tabClass}>Personal Info</TabsTrigger>
            <TabsTrigger value="details" className={tabClass}>Details</TabsTrigger>
            <TabsTrigger value="billing" className={tabClass}>Billing</TabsTrigger>
            <TabsTrigger value="custom" className={tabClass}>Custom Fields</TabsTrigger>
            <TabsTrigger value="notes" className={tabClass}>Office Notes</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* ── Personal Info ── */}
            <TabsContent value="personal" className="mt-0 space-y-3">
              <div className="flex flex-col gap-1.5">
                <Label>Display Name *</Label>
                <Input value={form.displayName} onChange={(e) => patch("displayName", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>First Name</Label>
                  <Input value={form.firstName} onChange={(e) => patch("firstName", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Last Name</Label>
                  <Input value={form.lastName} onChange={(e) => patch("lastName", e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label>Phone Numbers</Label>
                  <button
                    type="button"
                    onClick={addClientPhone}
                    className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                <div className="space-y-2">
                  {clientPhones.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <PhoneInput
                        value={p.phone}
                        onChange={(v) => patchClientPhone(idx, "phone", v)}
                        placeholder="Phone number"
                        className="flex-1"
                      />
                      <Select value={p.type} onValueChange={(v) => patchClientPhone(idx, "type", v)}>
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PHONE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        type="button"
                        title={p.isPrimary ? "Primary" : "Set as primary"}
                        onClick={() => patchClientPhone(idx, "isPrimary", true)}
                        className={`shrink-0 rounded p-1 text-sm font-medium transition-colors ${
                          p.isPrimary ? "bg-brand-100 text-brand-700" : "text-slate-300 hover:text-brand-600"
                        }`}
                      >
                        ★
                      </button>
                      {clientPhones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeClientPhone(idx)}
                          className="shrink-0 rounded p-1 text-slate-400 hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.primaryEmail} onChange={(e) => patch("primaryEmail", e.target.value)} />
              </div>

              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 pt-1">Service Address</p>
              <div className="flex flex-col gap-1.5">
                <Label>Street</Label>
                <Input value={form.serviceAddress} onChange={(e) => patch("serviceAddress", e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label>City</Label>
                  <Input value={form.serviceCity} onChange={(e) => patch("serviceCity", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>State</Label>
                  <Input value={form.serviceState} onChange={(e) => patch("serviceState", e.target.value)} className="uppercase" maxLength={2} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>ZIP</Label>
                  <Input value={form.serviceZip} onChange={(e) => patch("serviceZip", e.target.value)} />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="billingSameAsService"
                  checked={billingSameAsService}
                  onChange={(e) => setBillingSameAsService(e.target.checked)}
                  className="accent-brand-500"
                />
                <label htmlFor="billingSameAsService" className="text-sm cursor-pointer text-slate-600">
                  Billing address same as service address
                </label>
              </div>

              {!billingSameAsService && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 pt-1">Billing Address</p>
                  <div className="flex flex-col gap-1.5">
                    <Label>Street</Label>
                    <Input value={form.billingAddress} onChange={(e) => patch("billingAddress", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <Label>City</Label>
                      <Input value={form.billingCity} onChange={(e) => patch("billingCity", e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>State</Label>
                      <Input value={form.billingState} onChange={(e) => patch("billingState", e.target.value)} className="uppercase" maxLength={2} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>ZIP</Label>
                      <Input value={form.billingZip} onChange={(e) => patch("billingZip", e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-col gap-1.5">
                <Label>Notes to Crew</Label>
                <Input value={form.notesToCrew} onChange={(e) => patch("notesToCrew", e.target.value)} />
              </div>
            </TabsContent>

            {/* ── Details ── */}
            <TabsContent value="details" className="mt-0 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Account #</Label>
                  <Input
                    value={form.accountNumber}
                    onChange={(e) => patch("accountNumber", e.target.value)}
                    placeholder="Auto-assigned"
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
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => patch("priority", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Client Since</Label>
                  <Input type="date" value={form.clientSince} onChange={(e) => patch("clientSince", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Source{rf.req("source")}</Label>
                  <Select value={form.source || "__none__"} onValueChange={(v) => patch("source", v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select source…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {sourcesOptions.map((o) => (
                        <SelectItem key={o.id} value={o.value}>{o.value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Referred By</Label>
                <ClientCombobox
                  value={form.referredBy}
                  onChange={(v) => patch("referredBy", v)}
                  onSelectId={(id) => patch("referredByClientId", id)}
                  clients={allClients.filter((c) => c.id !== client.id)}
                  placeholder="Search clients, or type a name…"
                />
                {form.referredByClientId ? (
                  <p className="text-xs text-green-600">Linked to this client — will count toward their referral stats.</p>
                ) : form.referredBy ? (
                  <p className="text-xs text-slate-400">Freeform name — not linked to a client record.</p>
                ) : null}
              </div>
            </TabsContent>

            {/* ── Billing ── */}
            <TabsContent value="billing" className="mt-0 space-y-3">
              <div className="flex flex-col gap-1.5">
                <Label>Billing Email</Label>
                <Input type="email" value={form.billingEmail} onChange={(e) => patch("billingEmail", e.target.value)} placeholder="billing@example.com" />
                <p className="text-xs text-slate-400">If blank, invoices will be sent to the primary email.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Send Invoice By</Label>
                <div className="flex items-center gap-4 pt-1">
                  {(["email", "print", "both"] as const).map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="invoiceDelivery"
                        value={opt}
                        checked={form.invoiceDelivery === opt}
                        onChange={() => patch("invoiceDelivery", opt)}
                        className="accent-brand-500"
                      />
                      <span className="text-sm capitalize">{opt === "both" ? "Email & Print" : opt.charAt(0).toUpperCase() + opt.slice(1)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Payment Method</Label>
                <Select value={form.paymentMethod} onValueChange={(v) => patch("paymentMethod", v)}>
                  <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>When to Invoice</Label>
                  <Select value={form.invoiceFrequency} onValueChange={(v) => patch("invoiceFrequency", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="upon_completion">Upon Completion</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Default Invoice Terms</Label>
                  <Select value={form.defaultTerms} onValueChange={(v) => patch("defaultTerms", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                      <SelectItem value="net_10">Net 10</SelectItem>
                      <SelectItem value="net_15">Net 15</SelectItem>
                      <SelectItem value="net_30">Net 30</SelectItem>
                      <SelectItem value="net_45">Net 45</SelectItem>
                      <SelectItem value="net_60">Net 60</SelectItem>
                      <SelectItem value="net_90">Net 90</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Tax Rate (%)</Label>
                <Input
                  type="number"
                  step="0.25"
                  min="0"
                  max="30"
                  placeholder={orgSettings ? `Org default (${orgSettings.taxRatePercent}%)` : "Org default"}
                  value={form.defaultTaxRateBps > 0 ? (form.defaultTaxRateBps / 100).toFixed(2) : ""}
                  onChange={(e) => patch("defaultTaxRateBps", Math.round(parseFloat(e.target.value || "0") * 100))}
                />
                <p className="text-xs text-slate-400">Leave blank to use the organization default tax rate.</p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isTaxable"
                  checked={form.isTaxable}
                  onChange={(e) => patch("isTaxable", e.target.checked)}
                  className="accent-brand-500"
                />
                <label htmlFor="isTaxable" className="text-sm cursor-pointer">Client is taxable</label>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="doNotMarket"
                  checked={form.doNotMarket}
                  onChange={(e) => patch("doNotMarket", e.target.checked)}
                  className="accent-brand-500"
                />
                <label htmlFor="doNotMarket" className="text-sm cursor-pointer">Do not market</label>
              </div>
            </TabsContent>

            {/* ── Custom Fields ── */}
            <TabsContent value="custom" className="mt-0 space-y-1">
              <p className="text-xs text-slate-400 mb-3">
                Built-in takeoff measurements + org-defined custom fields.
                Add or remove fields in{" "}
                <a href="/crm/settings" className="text-brand-600 hover:underline">CRM Settings → Custom Fields</a>.
              </p>

              {/* Gate code moved here from Personal Info */}
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Access</p>
              <div className="mb-4">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Gate Code</Label>
                  <Input
                    value={form.gateCode}
                    onChange={(e) => patch("gateCode", e.target.value)}
                    className="h-8 text-sm"
                    placeholder="e.g. #1234"
                  />
                </div>
              </div>

              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Takeoffs</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {([
                  { label: "Turf Sq. Ft.", key: "turfSqft" as const },
                  { label: "Mulch Bed Sq. Ft.", key: "mulchBedSqft" as const },
                  { label: "Gross Sq. Ft.", key: "grossSqft" as const },
                  { label: "Linear Ft. Perimeter", key: "linearFtPerimeter" as const },
                  { label: "Linear Ft. Edging", key: "linearFtEdging" as const },
                  { label: "Yards of Mulch", key: "yardsOfMulch" as const },
                ] as const).map(({ label, key }) => (
                  <div key={key} className="flex flex-col gap-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form[key]}
                      onChange={(e) => patch(key, e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>

              {fieldDefs.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Custom Fields</p>
                  <div className="grid grid-cols-2 gap-3">
                    {fieldDefs.map((def) => (
                      <div key={def.id} className="flex flex-col gap-1">
                        <Label className="text-xs">
                          {def.name}{def.unit ? ` (${def.unit})` : ""}
                        </Label>
                        <Input
                          type={def.fieldType === "number" ? "number" : "text"}
                          value={customValues[def.id] ?? ""}
                          onChange={(e) => setCustomValues((p) => ({ ...p, [def.id]: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {fieldDefs.length === 0 && (
                <p className="text-sm text-slate-400 py-2 text-center">
                  No custom fields defined yet.{" "}
                  <a href="/crm/settings" className="text-brand-600 hover:underline">Add them in Settings.</a>
                </p>
              )}
            </TabsContent>

            {/* ── Office Notes ── */}
            <TabsContent value="notes" className="mt-0">
              <p className="text-xs text-slate-400 mb-2">Private internal notes — not visible to the client.</p>
              <textarea
                value={form.officeNotes}
                onChange={(e) => patch("officeNotes", e.target.value)}
                rows={12}
                placeholder="Enter internal billing notes, special instructions, or history…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-400 resize-y"
              />
            </TabsContent>
          </div>

          <div className="shrink-0 flex justify-end gap-2 border-t px-6 py-3 bg-white">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isPending || (rf.isRequired("source") && !form.source.trim())}>{isPending ? "Saving…" : "Save Changes"}</Button>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── AddContactDialog ──────────────────────────────────────────────────────────

const PHONE_TYPES: { value: PhoneType; label: string }[] = [
  { value: "cell",  label: "Cell" },
  { value: "home",  label: "Home" },
  { value: "work",  label: "Work" },
  { value: "fax",   label: "Fax" },
  { value: "other", label: "Other" },
];

function ContactDialog({
  clientId,
  open,
  onOpenChange,
  contact,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contact?: ClientContact | null;
}) {
  const isEditing = !!contact;
  const { mutateAsync: addContact, isPending: isAdding } = useAddClientContact();
  const { mutateAsync: updateContact, isPending: isUpdating } = useUpdateClientContact();
  const { mutateAsync: deleteContact, isPending: isDeleting } = useDeleteClientContact();
  const isPending = isAdding || isUpdating;
  const [firstName, setFirstName]   = useState("");
  const [lastName, setLastName]     = useState("");
  const [contactType, setContactType] = useState("");
  const [email, setEmail]           = useState("");
  const [isPrimary, setIsPrimary]   = useState(false);
  const [okToEmail, setOkToEmail]   = useState(false);
  const [notes, setNotes]           = useState("");
  const [phones, setPhones]         = useState<ContactPhone[]>([{ phone: "", type: "cell", isPrimary: true }]);

  useEffect(() => {
    if (!open) return;
    if (contact) {
      setFirstName(contact.firstName ?? "");
      setLastName(contact.lastName ?? "");
      setContactType(contact.contactType ?? "");
      setEmail(contact.email ?? "");
      setIsPrimary(contact.isPrimary ?? false);
      setOkToEmail(contact.okToEmail ?? false);
      setNotes(contact.notes ?? "");
      setPhones(
        contact.phones?.length
          ? contact.phones
          : contact.phone
            ? [{ phone: contact.phone, type: (contact.phoneType as PhoneType) ?? "cell", isPrimary: true }]
            : [{ phone: "", type: "cell", isPrimary: true }]
      );
    } else {
      setFirstName(""); setLastName(""); setContactType(""); setEmail("");
      setIsPrimary(false); setOkToEmail(false); setNotes("");
      setPhones([{ phone: "", type: "cell", isPrimary: true }]);
    }
  }, [open, contact]);

  function addPhone() {
    setPhones((prev) => [...prev, { phone: "", type: "cell", isPrimary: false }]);
  }

  function removePhone(idx: number) {
    setPhones((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // Ensure at least one is primary
      if (next.length > 0 && !next.some((p) => p.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next;
    });
  }

  function patchPhone(idx: number, field: keyof ContactPhone, value: string | boolean) {
    setPhones((prev) => prev.map((p, i) => {
      if (i !== idx) return field === "isPrimary" && value ? { ...p, isPrimary: false } : p;
      return { ...p, [field]: value };
    }));
  }

  function handleClose() {
    setFirstName(""); setLastName(""); setContactType(""); setEmail("");
    setIsPrimary(false); setOkToEmail(false); setNotes("");
    setPhones([{ phone: "", type: "cell", isPrimary: true }]);
    onOpenChange(false);
  }

  async function handleSave() {
    if (!firstName.trim()) { toast.error("First name is required"); return; }
    const validPhones = phones.filter((p) => p.phone.trim());
    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim() || null,
      contactType: contactType || null,
      email: email.trim() || null,
      phones: validPhones,
      phone: validPhones[0]?.phone ?? null,
      phoneType: validPhones[0]?.type ?? null,
      isPrimary,
      okToEmail,
      notes: notes.trim() || null,
    };
    try {
      if (isEditing && contact) {
        await updateContact({ id: contact.id, clientId, contact: payload });
        toast.success("Contact updated");
      } else {
        await addContact({ clientId, contact: payload });
        toast.success("Contact added");
      }
      handleClose();
    } catch { toast.error(isEditing ? "Failed to update contact" : "Failed to add contact"); }
  }

  async function handleDelete() {
    if (!contact) return;
    if (!confirm(`Remove ${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""} as a contact?`)) return;
    try {
      await deleteContact({ id: contact.id, clientId });
      toast.success("Contact removed");
      handleClose();
    } catch { toast.error("Failed to remove contact"); }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEditing ? "Edit Contact" : "Add Contact"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>First Name <span className="text-red-500">*</span></Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Last Name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Contact Type</Label>
            <Select value={contactType} onValueChange={setContactType}>
              <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
              <SelectContent>
                {CONTACT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          {/* Multi-phone */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Phone Numbers</Label>
              <button
                type="button"
                onClick={addPhone}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {phones.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <PhoneInput
                    value={p.phone}
                    onChange={(v) => patchPhone(idx, "phone", v)}
                    placeholder="Phone number"
                    className="flex-1"
                  />
                  <Select value={p.type} onValueChange={(v) => patchPhone(idx, "type", v)}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PHONE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    title={p.isPrimary ? "Primary" : "Set as primary"}
                    onClick={() => patchPhone(idx, "isPrimary", true)}
                    className={`shrink-0 rounded p-1 text-xs font-medium transition-colors ${
                      p.isPrimary
                        ? "bg-brand-100 text-brand-700"
                        : "text-slate-400 hover:text-brand-600"
                    }`}
                  >
                    ★
                  </button>
                  {phones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePhone(idx)}
                      className="shrink-0 rounded p-1 text-slate-400 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="rounded border-slate-300 accent-brand-500" />
              Primary contact
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={okToEmail} onChange={(e) => setOkToEmail(e.target.checked)} className="rounded border-slate-300 accent-brand-500" />
              OK to email
            </label>
          </div>
        </div>
        <DialogFooter className={isEditing ? "sm:justify-between" : undefined}>
          {isEditing && (
            <Button variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Removing…" : "Remove Contact"}
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={isPending}>{isPending ? "Saving…" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── AddPropertyDialog ─────────────────────────────────────────────────────────

function AddPropertyDialog({ clientId, open, onOpenChange }: { clientId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { mutateAsync: addProperty, isPending } = useAddClientProperty();
  const [form, setForm] = useState({
    name: "", address: "", city: "", state: "", zip: "", gateCode: "", notesToCrew: "",
  });

  function patch(k: keyof typeof form, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSave() {
    if (!form.address.trim() && !form.name.trim()) { toast.error("Address or name is required"); return; }
    try {
      await addProperty({ clientId, property: { ...form } });
      toast.success("Property added");
      setForm({ name: "", address: "", city: "", state: "", zip: "", gateCode: "", notesToCrew: "" });
      onOpenChange(false);
    } catch { toast.error("Failed to add property"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Property</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="flex flex-col gap-1.5">
            <Label>Property Name / Label</Label>
            <Input placeholder="e.g. Main Office, Rental Unit" value={form.name} onChange={(e) => patch("name", e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Street Address *</Label>
            <Input value={form.address} onChange={(e) => patch("address", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1 flex flex-col gap-1.5">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => patch("city", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>State</Label>
              <Input value={form.state} onChange={(e) => patch("state", e.target.value)} className="uppercase" maxLength={2} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>ZIP</Label>
              <Input value={form.zip} onChange={(e) => patch("zip", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Gate Code</Label>
              <Input value={form.gateCode} onChange={(e) => patch("gateCode", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Notes to Crew</Label>
              <Input value={form.notesToCrew} onChange={(e) => patch("notesToCrew", e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>{isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── LinkParentDialog ──────────────────────────────────────────────────────────

function LinkParentDialog({
  clientId,
  currentParentId,
  open,
  onOpenChange,
}: {
  clientId: string;
  currentParentId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { mutateAsync: setParent, isPending } = useSetParentClient();
  const { data: allClients } = useClients();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(currentParentId ?? "");

  const options = (allClients ?? []).filter(
    (c) => c.id !== clientId && c.parentClientId == null // can't link to a child
      && (search === "" || c.displayName.toLowerCase().includes(search.toLowerCase()))
  );

  async function handleSave() {
    try {
      await setParent({ id: clientId, parentClientId: selectedId || null });
      toast.success(selectedId ? "Parent account linked" : "Parent link removed");
      onOpenChange(false);
    } catch { toast.error("Failed to update parent link"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Link Parent Account</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500 -mt-2">
          Select the parent company or property management firm that this client rolls up to.
        </p>
        <div className="grid gap-3 py-1">
          <div className="flex flex-col gap-1.5">
            <Label>Search clients</Label>
            <Input
              placeholder="Type to filter…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
            <button
              type="button"
              onClick={() => setSelectedId("")}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${selectedId === "" ? "bg-brand-50 font-medium text-brand-700" : "text-slate-500"}`}
            >
              — No parent (standalone account)
            </button>
            {options.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${selectedId === c.id ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700"}`}
              >
                <span className="block">{c.displayName}</span>
                {c.billingCity && (
                  <span className="text-xs text-slate-400">{c.billingCity}, {c.billingState}</span>
                )}
              </button>
            ))}
            {options.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-slate-400">No matching clients</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>{isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── JobBorderColor ────────────────────────────────────────────────────────────

function jobBorderColor(job: CRMJob): string {
  if (job.jobType === "waiting_list") return "border-l-yellow-400";
  if (job.jobType === "package") return "border-l-blue-400";
  return "border-l-green-400";
}

// ── HomeTab ───────────────────────────────────────────────────────────────────

function HomeTab({ clientId, isLead = false, onSwitchTab }: { clientId: string; isLead?: boolean; onSwitchTab?: (tab: string) => void }) {
  const [jobFilter, setJobFilter] = useState<"active" | "completed">("active");
  const [clientVisitsModal, setClientVisitsModal] = useState<"upcoming" | "history" | null>(null);
  const [newEstimateOpen, setNewEstimateOpen] = useState(false);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJobType, setNewJobType] = useState<import("@/types/crm-jobs").JobType>("one_time");
  const [addingContract, setAddingContract] = useState(false);
  const [editingContract, setEditingContract] = useState<CRMContract | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobEditMode, setJobEditMode] = useState(false);
  const [visitsModal, setVisitsModal] = useState<{ job: CRMJob; jobName: string; mode: "upcoming" | "history" } | null>(null);
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [addInvoiceOpen, setAddInvoiceOpen] = useState(false);
  const [showAllAccounting, setShowAllAccounting] = useState(false);
  const [allAccountingOpen, setAllAccountingOpen] = useState(false);
  const [allEstimatesOpen, setAllEstimatesOpen] = useState(false);

  const { data: allJobs } = useClientJobs(clientId);
  const updateJobStatus = useUpdateJobStatus();
  const { data: invoices } = useInvoices(clientId);
  const { data: payments } = usePayments(clientId);
  const { data: estimates } = useEstimates(clientId);
  const { data: contracts } = useContracts(clientId);

  const jobs = (allJobs ?? []).filter((j) => {
    if (jobFilter === "active") return j.status !== "completed" && j.status !== "cancelled";
    return j.status === "completed" || j.status === "cancelled";
  });

  // Merge invoices + payments sorted by date desc
  type AccountingRow =
    | { kind: "invoice"; id: string; invoiceNumber: number; date: string; totalCents: number; balanceCents: number }
    | { kind: "payment"; id: string; date: string; amountCents: number };

  const accountingRows: AccountingRow[] = [
    ...(invoices ?? []).map((inv) => ({
      kind: "invoice" as const,
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      date: inv.invoiceDate,
      totalCents: inv.totalCents,
      balanceCents: inv.balanceCents,
    })),
    ...(payments ?? []).map((pmt) => ({
      kind: "payment" as const,
      id: pmt.id,
      date: pmt.paymentDate,
      amountCents: pmt.amountCents,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const ACCOUNTING_PAGE = 15;
  const accountingRowsVisible = accountingRows.slice(0, ACCOUNTING_PAGE);

  const openEstimates = (estimates ?? []).filter(
    (e) => e.stage !== "accepted" && e.stage !== "lost"
  );

  if (isLead) {
    // Leads only show the estimates column — full width
    const openEstimates = (estimates ?? []).filter((e) => e.stage !== "accepted" && e.stage !== "lost");
    return (
      <div className="flex flex-col overflow-hidden h-full">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="font-semibold text-sm text-slate-800">
            Estimates ({(estimates ?? []).length})
          </span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-brand-600"
            onClick={() => setNewEstimateOpen(true)}>
            <Plus className="mr-0.5 h-3 w-3" /> Add an Estimate
          </Button>
        </div>
        <div className="divide-y">
          {(estimates ?? []).length === 0 ? (
            <p className="px-4 py-8 text-xs text-slate-400 text-center">No estimates yet</p>
          ) : (
            (estimates ?? []).map((est) => (
              <button
                key={est.id}
                onClick={() => setSelectedEstimateId(est.id)}
                className="w-full px-4 py-2.5 text-left hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Badge variant="outline" className="text-[10px] capitalize mb-0.5">{est.stage}</Badge>
                    <p className="truncate text-xs text-slate-700">{est.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-slate-700">{formatCurrency(est.totalCents)}</p>
                    <p className="text-[10px] text-slate-400">{new Date(est.estimateDate).toLocaleDateString()}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        <NewEstimateDialog
          open={newEstimateOpen}
          onOpenChange={setNewEstimateOpen}
          defaultClientId={clientId}
          onCreated={() => setNewEstimateOpen(false)}
        />
        <EstimateDetailSheet
          estimateId={selectedEstimateId}
          onOpenChange={(open) => !open && setSelectedEstimateId(null)}
        />
      </div>
    );
  }

  return (
    <>
    <div className="grid min-h-[600px] bg-white px-3" style={{ gridTemplateColumns: "1fr 10px 1fr 10px 1fr" }}>
      {/* Left — Jobs */}
      <div className="flex flex-col bg-white">
        <div className="flex items-center justify-between bg-[#4a4a4a] px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-white">Jobs</span>
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white">{(allJobs ?? []).length}</span>
            <span className="text-white/30 text-xs">|</span>
            <button
              onClick={() => setClientVisitsModal("upcoming")}
              className="text-[11px] text-white/70 hover:text-white"
            >All Upcoming</button>
            <span className="text-white/30 text-xs">|</span>
            <button
              onClick={() => setClientVisitsModal("history")}
              className="text-[11px] text-white/70 hover:text-white"
            >All History</button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-white/80 hover:text-white hover:bg-white/10">
                <Plus className="mr-0.5 h-3 w-3" /> Add a Job
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs text-slate-500">Add a Job</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {([
                ["recurring",    "Add a recurring job"],
                ["one_time",     "Add a one time job"],
                ["waiting_list", "Add a waiting list job"],
                ["package",      "Add a package job"],
                ["project",      "Add a project"],
                ["snow",         "Add a snow job"],
              ] as const).map(([type, label]) => (
                <DropdownMenuItem key={type} onSelect={() => { setNewJobType(type); setNewJobOpen(true); }}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Active / Completed tabs */}
        <div className="flex border-b">
          {([
            ["active", "Active", (allJobs ?? []).filter((j) => j.status !== "completed" && j.status !== "cancelled").length],
            ["completed", "Completed", (allJobs ?? []).filter((j) => j.status === "completed" || j.status === "cancelled").length],
          ] as const).map(([f, label, count]) => (
            <button
              key={f}
              onClick={() => setJobFilter(f)}
              className={`flex items-center gap-1 px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                jobFilter === f
                  ? "border-brand-500 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] ${jobFilter === f ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div>
          {jobs.length === 0 ? (
            <p className="px-4 py-6 text-xs text-slate-400 text-center">No jobs</p>
          ) : (
            <div className="divide-y">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className={`flex items-stretch border-l-4 hover:bg-slate-50 ${jobBorderColor(job)}`}
                >
                  {/* Clickable main area */}
                  <button
                    onClick={() => { setJobEditMode(false); setSelectedJobId(job.id); }}
                    className="min-w-0 flex-1 px-4 py-3 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold capitalize text-slate-800 mb-0.5">
                          {job.jobType.replace("_", " ")}
                        </p>
                        {(job.services ?? []).slice(0, 3).map((svc) => (
                          <p key={svc.id} className="truncate text-xs text-slate-500">
                            {svc.serviceName}
                          </p>
                        ))}
                      </div>
                      <div className="shrink-0 text-right">
                        {job.rateCents != null && (
                          <p className="text-xs font-medium text-slate-700">
                            {formatCurrency(job.rateCents)}
                          </p>
                        )}
                        {job.scheduledDate && (
                          <p className="text-[10px] text-slate-400">
                            {formatDate(job.scheduledDate)}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* More dropdown */}
                  <div className="flex items-center pr-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-0.5 text-[10px] font-semibold tracking-wide text-slate-600 hover:bg-slate-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          MORE <ChevronDown className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => { setJobEditMode(true); setSelectedJobId(job.id); }}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Job
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setJobEditMode(false); setSelectedJobId(job.id); }}>
                          <Eye className="mr-2 h-3.5 w-3.5" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setVisitsModal({ job, jobName: (job.services ?? []).map((s) => s.serviceName).join(", ") || job.jobType, mode: "upcoming" })}>
                          <Calendar className="mr-2 h-3.5 w-3.5" /> View Upcoming
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setVisitsModal({ job, jobName: (job.services ?? []).map((s) => s.serviceName).join(", ") || job.jobType, mode: "history" })}>
                          <History className="mr-2 h-3.5 w-3.5" /> View History
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {job.status !== "cancelled" && (
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={async () => {
                              if (!confirm("Cancel this job?")) return;
                              try {
                                await updateJobStatus.mutateAsync({ id: job.id, status: "cancelled", scheduledDate: job.scheduledDate ?? "", clientId });
                                toast.success("Job cancelled");
                              } catch {
                                toast.error("Failed to cancel job");
                              }
                            }}
                          >
                            <Ban className="mr-2 h-3.5 w-3.5" /> Cancel Job
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Divider column */}
      <div className="flex justify-center bg-white"><div className="w-px h-full bg-slate-200" /></div>

      {/* Middle — Accounting */}
      <div className="flex flex-col bg-white">
        <div className="flex items-center justify-between bg-[#4a4a4a] px-4 py-2">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-white">Accounting</span>
            <button
              className="text-[11px] text-white/70 hover:text-white"
              onClick={() => setAllAccountingOpen(true)}
            >
              All
            </button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-white/80 hover:text-white hover:bg-white/10">
                <Plus className="mr-0.5 h-3 w-3" /> Add a Transaction
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setAddInvoiceOpen(true)}>Invoice</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAddPaymentOpen(true)}>Payment</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="divide-y overflow-y-auto">
          {accountingRows.length === 0 ? (
            <p className="px-4 py-6 text-xs text-slate-400 text-center">No transactions</p>
          ) : (
            <>
              {accountingRowsVisible.map((row) => {
                const pmt = row.kind === "payment" ? (payments ?? []).find((p) => p.id === row.id) : null;
                return row.kind === "invoice" ? (
                  <div key={`inv-${row.id}`} className="border-l-4 border-l-yellow-400 px-4 py-3 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelectedInvoiceId(row.id)}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-800">Invoice #{row.invoiceNumber}</p>
                      <p className="shrink-0 text-[10px] text-slate-400">{new Date(row.date + "T12:00:00").toLocaleDateString()}</p>
                    </div>
                    <div className="mt-0.5 flex gap-3 text-xs text-slate-500">
                      <span>Amt: {formatCurrency(row.totalCents)}</span>
                      <span className={row.balanceCents > 0 ? "font-medium text-red-500" : "text-slate-400"}>
                        Bal: {formatCurrency(row.balanceCents)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <button
                    key={`pmt-${row.id}`}
                    onClick={() => setSelectedPaymentId(row.id)}
                    className="w-full text-left border-l-4 border-l-green-400 px-4 py-3 hover:bg-green-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-800">Payment{pmt?.method ? ` · ${pmt.method}` : ""}</p>
                      <p className="shrink-0 text-[10px] text-slate-400">{new Date(row.date + "T12:00:00").toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs font-medium text-green-600">({formatCurrency(row.amountCents)})</p>
                      {pmt?.reference && <p className="text-[10px] text-slate-400">#{pmt.reference}</p>}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Divider column */}
      <div className="flex justify-center bg-white"><div className="w-px h-full bg-slate-200" /></div>

      {/* Right — Estimates + Contracts */}
      <div className="flex flex-col bg-white divide-y">
        {/* Estimates */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between bg-[#4a4a4a] px-4 py-2">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-white">Open Estimates</span>
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white">{openEstimates.length}</span>
              <button
                className="text-[11px] text-white/70 hover:text-white"
                onClick={() => setAllEstimatesOpen(true)}
              >
                All
              </button>
            </div>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => setNewEstimateOpen(true)}>
              <Plus className="mr-0.5 h-3 w-3" /> Add an Estimate
            </Button>
          </div>

          <div className="divide-y">
            {openEstimates.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-400 text-center">No open estimates</p>
            ) : (
              openEstimates.map((est) => (
                <button key={est.id} className="w-full text-left px-4 py-3 hover:bg-slate-50"
                  onClick={() => setSelectedEstimateId(est.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Badge variant="outline" className="text-[10px] capitalize mb-1">
                        {est.stage}
                      </Badge>
                      <p className="truncate text-xs text-slate-700">{est.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold text-slate-700">
                        {formatCurrency(est.totalCents)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(est.estimateDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Contracts */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between bg-[#4a4a4a] px-4 py-2">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-white">Contracts</span>
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white">{(contracts ?? []).length}</span>
              <button className="text-[11px] text-white/70 hover:text-white" onClick={() => onSwitchTab?.("contracts")}>All</button>
            </div>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => setAddingContract(true)}>
              <Plus className="mr-0.5 h-3 w-3" /> Add a Contract
            </Button>
          </div>

          <div className="divide-y">
            {(contracts ?? []).length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-400 text-center">No contracts</p>
            ) : (
              (contracts ?? []).map((contract) => (
                <div
                  key={contract.id}
                  className="cursor-pointer px-4 py-3 hover:bg-slate-50"
                  onClick={() => setEditingContract(contract)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-slate-700">{contract.title}</p>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {formatCurrency(contract.monthlyAmountCents)}/mo
                    </Badge>
                  </div>
                  {(contract.startDate || contract.endDate) && (
                    <p className="text-[10px] text-slate-400">
                      {contract.startDate ? new Date(contract.startDate).toLocaleDateString() : "—"}
                      {" – "}
                      {contract.endDate ? new Date(contract.endDate).toLocaleDateString() : "ongoing"}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <NewEstimateDialog
        open={newEstimateOpen}
        onOpenChange={setNewEstimateOpen}
        defaultClientId={clientId}
        onCreated={() => setNewEstimateOpen(false)}
      />
    </div>
    <JobDetailSheet
      jobId={selectedJobId}
      initialEditing={jobEditMode}
      onOpenChange={(open) => { if (!open) { setSelectedJobId(null); setJobEditMode(false); } }}
    />
    <EstimateDetailSheet
      estimateId={selectedEstimateId}
      onOpenChange={(open) => !open && setSelectedEstimateId(null)}
    />
    <InvoiceDetailSheet
      invoiceId={selectedInvoiceId}
      onOpenChange={(open) => !open && setSelectedInvoiceId(null)}
    />
    <PaymentDetailDialog
      payment={(payments ?? []).find((p) => p.id === selectedPaymentId) ?? null}
      onClose={() => setSelectedPaymentId(null)}
    />
    <NewJobDialog
      open={newJobOpen}
      onOpenChange={setNewJobOpen}
      clientId={clientId}
      initialJobType={newJobType}
      onCreated={(jobId) => { setNewJobOpen(false); setSelectedJobId(jobId); }}
    />
    <ContractDialog
      key={editingContract?.id ?? "new"}
      open={addingContract || !!editingContract}
      onOpenChange={(o) => { if (!o) { setAddingContract(false); setEditingContract(null); } }}
      contract={editingContract ?? undefined}
      defaultClientId={clientId}
      clients={[]}
    />
    <AddPaymentDialog
      open={addPaymentOpen}
      onOpenChange={setAddPaymentOpen}
      defaultClientId={clientId}
    />
    <NewInvoiceSheet
      open={addInvoiceOpen}
      onClose={() => setAddInvoiceOpen(false)}
      defaultClientId={clientId}
    />
    {allAccountingOpen && (
      <AllAccountingModal
        invoices={invoices ?? []}
        payments={payments ?? []}
        onClose={() => setAllAccountingOpen(false)}
        onOpenInvoice={(id) => { setAllAccountingOpen(false); setSelectedInvoiceId(id); }}
        onOpenPayment={(id) => { setAllAccountingOpen(false); setSelectedPaymentId(id); }}
      />
    )}
    {allEstimatesOpen && (
      <AllEstimatesModal
        estimates={estimates ?? []}
        onClose={() => setAllEstimatesOpen(false)}
        onOpenEstimate={(id) => { setAllEstimatesOpen(false); setSelectedEstimateId(id); }}
      />
    )}
    {visitsModal && (
      <JobVisitsModal
        job={visitsModal.job}
        jobName={visitsModal.jobName}
        mode={visitsModal.mode}
        onClose={() => setVisitsModal(null)}
        onOpenJob={(id) => { setVisitsModal(null); setJobEditMode(false); setSelectedJobId(id); }}
      />
    )}
    {clientVisitsModal && (
      <ClientAllVisitsModal
        clientId={clientId}
        mode={clientVisitsModal}
        onClose={() => setClientVisitsModal(null)}
        onOpenJob={(id) => { setClientVisitsModal(null); setJobEditMode(false); setSelectedJobId(id); }}
      />
    )}
    </>
  );
}

// ── JobVisitsModal ────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "2-digit", day: "2-digit", year: "numeric" });
}

// A visit belongs in "History" once it's reached a terminal state, regardless of
// its scheduled date — a dispatched-but-not-yet-completed visit for a past date
// still needs action, so it stays in "Upcoming" until marked completed/cancelled/skipped.
const TERMINAL_VISIT_STATUSES = new Set(["completed", "cancelled", "skipped"]);

function JobVisitsModal({
  job,
  jobName,
  mode,
  onClose,
  onOpenJob,
}: {
  job: CRMJob;
  jobName: string;
  mode: "upcoming" | "history";
  onClose: () => void;
  onOpenJob: (id: string) => void;
}) {
  // job_type stays 'waiting_list' even after a visit is dispatched (see
  // useCreateVisit), so "still waiting" has to be derived from whether it
  // has a real visit yet, not from job_type alone.
  const { data: visits = [], isLoading } = useJobVisits(job.id);
  const isWaitingList = job.jobType === "waiting_list" && !visits.some((v) => !v.deletedAt);
  const { data: allServices = [] } = useAllCRMServices();
  const serviceCodeMap = useMemo(() => {
    const m: Record<string, string> = {};
    allServices.forEach((s) => { if (s.id && s.code) m[s.id] = s.code; });
    return m;
  }, [allServices]);
  const serviceLabel = useMemo(() => {
    return (job.services ?? []).map((s) => serviceCodeMap[s.serviceId ?? ""] ?? s.serviceName).join(", ") || jobName;
  }, [job.services, serviceCodeMap, jobName]);
  const serviceById = useMemo(() => {
    const m: Record<string, CRMJobService> = {};
    (job.services ?? []).forEach((s) => { m[s.id] = s; });
    return m;
  }, [job.services]);
  // Package jobs have multiple services (e.g. FERT 1 of 5, FERT 2 of 5…) — show
  // the specific service for each visit instead of every service joined together.
  function visitServiceLabel(v: CRMJobVisit): string {
    const svc = v.jobServiceId ? serviceById[v.jobServiceId] : null;
    return svc ? (serviceCodeMap[svc.serviceId ?? ""] ?? svc.serviceName) : serviceLabel;
  }
  const filtered = visits.filter((v: CRMJobVisit) => {
    if (v.deletedAt) return false;
    const isTerminal = TERMINAL_VISIT_STATUSES.has(v.status);
    return mode === "upcoming" ? !isTerminal : isTerminal;
  }).sort((a: CRMJobVisit, b: CRMJobVisit) =>
    mode === "upcoming"
      ? a.scheduledDate.localeCompare(b.scheduledDate)
      : b.scheduledDate.localeCompare(a.scheduledDate)
  );

  // Waiting list services rendered as rows (date range, not visit dates)
  const waitingListRows = isWaitingList ? (job.services ?? []) : [];
  const dateRangeStr = (job.waitingListStart && job.waitingListEnd)
    ? `${fmtDate(job.waitingListStart)} – ${fmtDate(job.waitingListEnd)}`
    : job.waitingListStart ? `From ${fmtDate(job.waitingListStart)}` : "Date range not set";

  const title = mode === "upcoming" ? `${jobName} — Upcoming` : `${jobName} — History`;
  const isEmpty = isWaitingList ? (mode === "history" || waitingListRows.length === 0) : filtered.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex max-h-[80vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-2xl">
        {/* Header — neutral gray, no blue */}
        <div className="flex items-center justify-between border-b bg-neutral-700 px-6 py-3 rounded-t-lg">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-neutral-300 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          {isLoading && !isWaitingList ? (
            <div className="p-6 text-sm text-neutral-400 text-center">Loading…</div>
          ) : isEmpty ? (
            <div className="p-6 text-sm text-neutral-400 text-center">
              No {mode === "upcoming" ? "upcoming" : "history"} found.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-neutral-600 text-white">
                <tr>
                  <th className="px-4 py-2 text-left font-medium w-6"></th>
                  <th className="px-4 py-2 text-left font-medium">Date of Service</th>
                  <th className="px-4 py-2 text-left font-medium">Service</th>
                  <th className="px-4 py-2 text-left font-medium">Assigned To</th>
                  {mode === "history" && <th className="px-4 py-2 text-right font-medium">Men</th>}
                  <th className="px-4 py-2 text-right font-medium">
                    {mode === "upcoming" ? "B. Hrs." : "Time"}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  {mode === "upcoming" && <th className="px-4 py-2 text-center font-medium">Priority</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {isWaitingList ? waitingListRows.map((svc) => {
                  const hrs = svc.budgetedHours > 0 ? `${svc.budgetedHours}hrs` : (job.budgetedHours != null ? `${job.budgetedHours}hrs` : "—");
                  const amt = svc.rateCents != null ? `$${(svc.rateCents / 100).toFixed(2)}` : "—";
                  return (
                    <tr key={svc.id} className="cursor-pointer hover:bg-neutral-50" onClick={() => { onClose(); onOpenJob(job.id); }}>
                      <td className="px-4 py-2.5 text-center">
                        <div className="inline-flex gap-0.5">
                          <div className="h-3.5 w-1.5 rounded-sm bg-blue-400" />
                          <div className="h-3.5 w-1.5 rounded-sm bg-blue-400" />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-700 whitespace-nowrap">{dateRangeStr}</td>
                      <td className="px-4 py-2.5 text-neutral-700">{svc.serviceName}</td>
                      <td className="px-4 py-2.5 text-neutral-500">{svc.assignedTo ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right text-neutral-700">{hrs}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-neutral-800">{amt}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                          {job.priority ?? 1}
                        </span>
                      </td>
                    </tr>
                  );
                }) : filtered.map((v: CRMJobVisit) => {
                  // Fall back to job-level budgeted hours if visit doesn't have its own
                  const hours = mode === "history"
                    ? (() => { const h = computeActualHours(v); return h != null ? `${h.toFixed(1)}hrs` : "0hrs"; })()
                    : (v.budgetedHours != null ? `${v.budgetedHours}hrs` : job.budgetedHours != null ? `${job.budgetedHours}hrs` : "—");
                  const amount = v.rateCents != null ? `$${(v.rateCents / 100).toFixed(2)}` : (job.rateCents != null ? `$${(job.rateCents / 100).toFixed(2)}` : "—");
                  const dateStr = fmtDate(v.scheduledDate);

                  return (
                    <tr key={v.id} className="cursor-pointer hover:bg-neutral-50" onClick={() => { onClose(); onOpenJob(job.id); }}>
                      <td className="px-4 py-2.5 text-center">
                        <VisitStatusIcon status={v.status} className="h-3.5 w-3.5 inline" />
                      </td>
                      <td className="px-4 py-2.5 text-neutral-700">{dateStr}</td>
                      <td className="px-4 py-2.5 text-neutral-700">{visitServiceLabel(v)}</td>
                      <td className="px-4 py-2.5 text-neutral-500">{v.crewName ?? "—"}</td>
                      {mode === "history" && (
                        <td className="px-4 py-2.5 text-right text-neutral-700">{v.menCount}</td>
                      )}
                      <td className="px-4 py-2.5 text-right text-neutral-700">{hours}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-neutral-800">{amount}</td>
                      {mode === "upcoming" && (
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            v.priority >= 3 ? "bg-red-100 text-red-700" :
                            v.priority === 2 ? "bg-yellow-100 text-yellow-700" :
                            "bg-neutral-100 text-neutral-500"
                          }`}>{v.priority}</span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer count */}
        <div className="border-t px-6 py-2 text-xs text-neutral-400">
          {isWaitingList ? `${waitingListRows.length} service${waitingListRows.length !== 1 ? "s" : ""}` : `${filtered.length} ${mode === "upcoming" ? "upcoming visit" : "visit"}${filtered.length !== 1 ? "s" : ""}`}
        </div>
      </div>
    </div>
  );
}

function AllContactsModal({
  contacts,
  onClose,
  onOpenContact,
  onAddContact,
}: {
  contacts: ClientContact[];
  onClose: () => void;
  onOpenContact: (c: ClientContact) => void;
  onAddContact: () => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = contacts.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      `${c.firstName} ${c.lastName ?? ""}`.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.contactType ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex flex-col bg-white rounded-lg shadow-2xl w-[700px] max-h-[80vh]">
        <div className="flex items-center justify-between border-b px-6 py-3">
          <h2 className="text-base font-semibold text-neutral-800">All Contacts</h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, type…"
              className="text-xs border border-neutral-200 rounded px-2.5 py-1.5 w-56 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onAddContact}>
              <Plus className="mr-1 h-3 w-3" /> Add Contact
            </Button>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-auto flex-1">
          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-neutral-400 text-center">No contacts found.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-neutral-600 text-white">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-left font-medium">Phone</th>
                  <th className="px-4 py-2 text-left font-medium">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-neutral-50"
                    onClick={() => onOpenContact(c)}
                  >
                    <td className="px-4 py-2.5 font-medium text-neutral-800">
                      {c.firstName} {c.lastName}
                      {c.isPrimary && (
                        <Badge variant="secondary" className="ml-1.5 text-[9px] h-4 px-1.5">Primary</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500 capitalize">{c.contactType ?? "—"}</td>
                    <td className="px-4 py-2.5 text-neutral-600">
                      {(c.phones?.length > 0 ? c.phones : c.phone ? [{ phone: c.phone, type: c.phoneType ?? "cell", isPrimary: true }] : [])
                        .map((p) => p.phone).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{c.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t px-6 py-2 text-xs text-neutral-400">
          {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}

function AllAccountingModal({
  invoices,
  payments,
  onClose,
  onOpenInvoice,
  onOpenPayment,
}: {
  invoices: CRMInvoice[];
  payments: CRMPayment[];
  onClose: () => void;
  onOpenInvoice: (id: string) => void;
  onOpenPayment: (id: string) => void;
}) {
  const [search, setSearch] = useState("");

  type Row =
    | { kind: "invoice"; id: string; invoiceNumber: number; date: string; totalCents: number; balanceCents: number; status: string }
    | { kind: "payment"; id: string; date: string; amountCents: number; method: string; reference: string | null };

  const rows: Row[] = [
    ...invoices.map((inv) => ({
      kind: "invoice" as const,
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      date: inv.invoiceDate,
      totalCents: inv.totalCents,
      balanceCents: inv.balanceCents,
      status: inv.status,
    })),
    ...payments.map((pmt) => ({
      kind: "payment" as const,
      id: pmt.id,
      date: pmt.paymentDate,
      amountCents: pmt.amountCents,
      method: pmt.method,
      reference: pmt.reference,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    if (r.kind === "invoice") return String(r.invoiceNumber).includes(q) || r.status.includes(q);
    return r.method.toLowerCase().includes(q) || (r.reference ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex flex-col bg-white rounded-lg shadow-2xl w-[900px] max-h-[80vh]">
        <div className="flex items-center justify-between border-b px-6 py-3">
          <h2 className="text-base font-semibold text-neutral-800">All Accounting</h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, method, reference…"
              className="text-xs border border-neutral-200 rounded px-2.5 py-1.5 w-56 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-auto flex-1">
          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-neutral-400 text-center">No transactions found.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-neutral-600 text-white">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-left font-medium">Details</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((row) =>
                  row.kind === "invoice" ? (
                    <tr
                      key={`inv-${row.id}`}
                      className="cursor-pointer hover:bg-neutral-50 border-l-4 border-l-yellow-400"
                      onClick={() => onOpenInvoice(row.id)}
                    >
                      <td className="px-4 py-2.5 text-neutral-700">{new Date(row.date + "T12:00:00").toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 text-neutral-500">Invoice</td>
                      <td className="px-4 py-2.5 font-medium text-neutral-800">#{row.invoiceNumber}</td>
                      <td className="px-4 py-2.5 text-right text-neutral-800">{formatCurrency(row.totalCents)}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${row.balanceCents > 0 ? "text-red-500" : "text-neutral-400"}`}>
                        {formatCurrency(row.balanceCents)}
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={`pmt-${row.id}`}
                      className="cursor-pointer hover:bg-neutral-50 border-l-4 border-l-green-400"
                      onClick={() => onOpenPayment(row.id)}
                    >
                      <td className="px-4 py-2.5 text-neutral-700">{new Date(row.date + "T12:00:00").toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 text-neutral-500">Payment</td>
                      <td className="px-4 py-2.5 text-neutral-600">
                        {row.method}{row.reference ? ` · #${row.reference}` : ""}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-green-600">({formatCurrency(row.amountCents)})</td>
                      <td className="px-4 py-2.5 text-right text-neutral-400">—</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t px-6 py-2 text-xs text-neutral-400">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}

function AllEstimatesModal({
  estimates,
  onClose,
  onOpenEstimate,
}: {
  estimates: Estimate[];
  onClose: () => void;
  onOpenEstimate: (id: string) => void;
}) {
  const [search, setSearch] = useState("");

  const rows = [...estimates].sort(
    (a, b) => new Date(b.estimateDate).getTime() - new Date(a.estimateDate).getTime()
  );

  const filtered = rows.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return e.description.toLowerCase().includes(q) || e.stage.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex flex-col bg-white rounded-lg shadow-2xl w-[900px] max-h-[80vh]">
        <div className="flex items-center justify-between border-b px-6 py-3">
          <h2 className="text-base font-semibold text-neutral-800">All Estimates</h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description, stage…"
              className="text-xs border border-neutral-200 rounded px-2.5 py-1.5 w-56 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-auto flex-1">
          {filtered.length === 0 ? (
            <div className="p-6 text-sm text-neutral-400 text-center">No estimates found.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-neutral-600 text-white">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-left font-medium">Stage</th>
                  <th className="px-4 py-2 text-left font-medium">Description</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer hover:bg-neutral-50"
                    onClick={() => onOpenEstimate(e.id)}
                  >
                    <td className="px-4 py-2.5 text-neutral-700">
                      {new Date(e.estimateDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="text-[10px] capitalize">{e.stage}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-neutral-800">{e.description}</td>
                    <td className="px-4 py-2.5 text-right text-neutral-800">{formatCurrency(e.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t px-6 py-2 text-xs text-neutral-400">
          {filtered.length} estimate{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}

function ClientAllVisitsModal({
  clientId,
  mode,
  onClose,
  onOpenJob,
}: {
  clientId: string;
  mode: "upcoming" | "history";
  onClose: () => void;
  onOpenJob: (id: string) => void;
}) {
  const { data: visits = [], isLoading } = useClientAllVisits(clientId);
  const { data: allServices = [] } = useAllCRMServices();
  const serviceCodeMap = useMemo(() => {
    const byId: Record<string, string> = {};
    const byName: Record<string, string> = {};
    allServices.forEach((s) => {
      if (s.code) {
        if (s.id) byId[s.id] = s.code;
        if (s.name) byName[s.name.toLowerCase()] = s.code;
      }
    });
    return { byId, byName };
  }, [allServices]);

  function visitServiceLabel(v: CRMJobVisit): string {
    const names = v.serviceNames ?? [];
    const ids = v.serviceIds ?? [];
    if (names.length === 0) return v.invoiceDescription ?? "—";
    return names.map((name, i) => {
      const id = ids[i];
      return (id && serviceCodeMap.byId[id])
        || serviceCodeMap.byName[name.toLowerCase()]
        || name;
    }).join(", ");
  }

  const [historySearch, setHistorySearch] = useState("");

  const filtered = visits
    .filter((v: CRMJobVisit) =>
      mode === "upcoming"
        ? !TERMINAL_VISIT_STATUSES.has(v.status)
        : TERMINAL_VISIT_STATUSES.has(v.status)
    )
    .filter((v: CRMJobVisit) => {
      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase();
      return (
        visitServiceLabel(v).toLowerCase().includes(q) ||
        v.crewName?.toLowerCase().includes(q) ||
        v.scheduledDate?.includes(q)
      );
    })
    .sort((a: CRMJobVisit, b: CRMJobVisit) =>
      mode === "upcoming"
        ? a.scheduledDate.localeCompare(b.scheduledDate)
        : b.scheduledDate.localeCompare(a.scheduledDate)
    );

  const title = mode === "upcoming" ? "All Upcoming" : "All History";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="flex flex-col bg-white rounded-lg shadow-2xl w-[900px] max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-3">
          <h2 className="text-base font-semibold text-neutral-800">{title}</h2>
          <div className="flex items-center gap-3">
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search service, crew, date…"
                className="text-xs border border-neutral-200 rounded px-2.5 py-1.5 w-52 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          {isLoading ? (
            <div className="p-6 text-sm text-neutral-400 text-center">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-neutral-400 text-center">
              No {mode === "upcoming" ? "upcoming visits" : "visit history"} found.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-neutral-600 text-white">
                <tr>
                  <th className="px-4 py-2 text-left font-medium w-6"></th>
                  <th className="px-4 py-2 text-left font-medium">Date of Service</th>
                  <th className="px-4 py-2 text-left font-medium">Service</th>
                  <th className="px-4 py-2 text-left font-medium">Assigned To</th>
                  {mode === "history" && <th className="px-4 py-2 text-right font-medium">Men</th>}
                  <th className="px-4 py-2 text-right font-medium">{mode === "upcoming" ? "B. Hrs." : "Time"}</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  {mode === "upcoming" && <th className="px-4 py-2 text-center font-medium">Priority</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((v: CRMJobVisit) => {
                  const hours = mode === "history"
                    ? (() => { const h = computeActualHours(v); return h != null ? `${h.toFixed(1)}hrs` : "0hrs"; })()
                    : (v.budgetedHours != null ? `${v.budgetedHours}hrs` : "—");
                  const amount = v.rateCents != null ? `$${(v.rateCents / 100).toFixed(2)}` : "—";
                  return (
                    <tr
                      key={v.id}
                      className="cursor-pointer hover:bg-neutral-50"
                      onClick={() => { onClose(); onOpenJob(v.jobId); }}
                    >
                      <td className="px-4 py-2.5 text-center">
                        <VisitStatusIcon status={v.status} className="h-3.5 w-3.5 inline" />
                      </td>
                      <td className="px-4 py-2.5 text-neutral-700">{fmtDate(v.scheduledDate)}</td>
                      <td className="px-4 py-2.5 text-neutral-700">{visitServiceLabel(v)}</td>
                      <td className="px-4 py-2.5 text-neutral-500">{v.crewName ?? "—"}</td>
                      {mode === "history" && (
                        <td className="px-4 py-2.5 text-right text-neutral-700">{v.menCount}</td>
                      )}
                      <td className="px-4 py-2.5 text-right text-neutral-700">{hours}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-neutral-800">{amount}</td>
                      {mode === "upcoming" && (
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            v.priority >= 3 ? "bg-red-100 text-red-700" :
                            v.priority === 2 ? "bg-yellow-100 text-yellow-700" :
                            "bg-neutral-100 text-neutral-500"
                          }`}>{v.priority}</span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t px-6 py-2 text-xs text-neutral-400">
          {filtered.length} {mode === "upcoming" ? "upcoming visit" : "visit"}{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}

// ── ClientDetailPanel ─────────────────────────────────────────────────────────

interface Props {
  clientId: string;
  expanded?: boolean;
  onExpandChange?: (v: boolean) => void;
}

export function ClientDetailPanel({ clientId, expanded = false, onExpandChange }: Props) {
  const { data: client, isLoading } = useClient(clientId);
  const { data: contacts } = useClientContacts(clientId);
  const { data: properties } = useClientProperties(clientId);
  const { data: childClients } = useChildClients(clientId);
  const { data: parentClient } = useClient(client?.parentClientId ?? "");
  const [activeTab, setActiveTab] = useState("home");
  const [editOpen, setEditOpen] = useState(false);
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [editContact, setEditContact] = useState<ClientContact | null>(null);
  const [allContactsOpen, setAllContactsOpen] = useState(false);
  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [aerialMeasurementOpen, setAerialMeasurementOpen] = useState(false);
  const [linkParentOpen, setLinkParentOpen] = useState(false);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [openPaymentId, setOpenPaymentId] = useState<string | null>(null);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [openJobInitialTab, setOpenJobInitialTab] = useState<Tab | undefined>(undefined);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [portalInviteOpen, setPortalInviteOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const { mutateAsync: convertLead, isPending: converting } = useConvertLeadToClient();
  const { mutateAsync: activate } = useActivateClient();
  const { mutate: addTag } = useAddClientTag();
  const { mutate: removeTag } = useRemoveClientTag();
  const orgTags = useOrgTags();
  const { data: openTicket } = useTicket(openTicketId ?? "");
  const { data: openPayment } = usePayment(openPaymentId ?? undefined);
  const router = useRouter();
  const isLead = client?.status === "lead";
  // A closed-lost lead never became a client either — keep the same simplified
  // lead layout (no Jobs/Accounting/Contracts) rather than the full client view.
  const isLeadLike = isLead || client?.status === "lost";
  const hasChildren = (childClients ?? []).length > 0;
  const totalChildBalance = (childClients ?? []).reduce((sum, c) => sum + c.balanceOutstandingCents, 0);
  const { data: leadEstimates } = useEstimates(clientId);
  const revenuePotentialCents = (leadEstimates ?? [])
    .filter((e) => e.stage !== "accepted" && e.stage !== "lost")
    .reduce((sum, e) => sum + e.totalCents, 0);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!client) return null;

  async function handleConvert() {
    try {
      await convertLead(clientId);
      toast.success(`${client!.displayName} converted to client`);
      router.push(`/crm/clients/${clientId}`);
    } catch { toast.error("Failed to convert lead"); }
  }

  const address = [client.billingAddress, client.billingCity, client.billingState, client.billingZip]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b px-6 py-3">
        <div className="flex items-stretch justify-between gap-4">
          {/* Left column — stretches to match balance card height */}
          <div className="min-w-0 flex-1 flex flex-col">
            {/* Name + status row */}
            <div className="flex items-center gap-2">
              {client.accountType === "commercial" ? (
                <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
              ) : (
                <Home className="h-4 w-4 shrink-0 text-slate-400" />
              )}
              <h2 className="truncate text-lg font-semibold text-slate-900">{client.displayName}</h2>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${STATUS_COLOR[client.status]}`}>
                {client.status}
              </span>
              {client.priority === "high" && (
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border bg-red-100 text-red-700 border-red-200">
                  {client.priority}
                </span>
              )}
              {client.doNotMarket && (
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border bg-orange-100 text-orange-700 border-orange-200">
                  Do Not Market
                </span>
              )}
            </div>

            {/* Info row: address on left, contact details on right */}
            <div className="mt-1.5 flex gap-8">
              {/* Left — billing address (two lines) */}
              {(client.billingAddress || client.billingCity) && (
                <div className="flex items-start gap-1 text-sm text-slate-500 leading-snug">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div>
                    {client.billingAddress && <div>{client.billingAddress}</div>}
                    <div>{[client.billingCity, client.billingState, client.billingZip].filter(Boolean).join(", ")}</div>
                  </div>
                </div>
              )}

              {/* Right — phone, email, salesperson */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                {client.primaryPhone && (
                  <a href={`tel:${client.primaryPhone}`} className="flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
                    <Phone className="h-3.5 w-3.5" />{client.primaryPhone}
                  </a>
                )}
                {client.primaryEmail && (
                  <a href={`mailto:${client.primaryEmail}`} className="flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
                    <Mail className="h-3.5 w-3.5" />{client.primaryEmail}
                  </a>
                )}
                {client.salesRepName && (
                  <span className="flex items-center gap-1 text-sm text-slate-500">
                    <UserCircle className="h-3.5 w-3.5" />{client.salesRepName}
                  </span>
                )}
              </div>
            </div>

            {/* Spacer pushes tags + source to the bottom of the left column */}
            <div className="flex-1" />

            {/* Tags + source/client since — bottom-aligned with the balance card */}
            <div className="flex flex-col gap-2">
              <TagEditor
                tags={client.tags ?? []}
                suggestions={orgTags}
                onAdd={(tag) => addTag({ clientId, tag })}
                onRemove={(tag) => removeTag({ clientId, tag })}
              />
              <div className="flex flex-wrap gap-x-6 gap-y-0.5">
                {client.accountNumber && <InfoRow label="Account #" value={client.accountNumber} />}
                {client.priority && <InfoRow label="Priority" value={client.priority.charAt(0).toUpperCase() + client.priority.slice(1)} />}
                {client.source && <InfoRow label="Source" value={client.source} />}
                {client.clientSince && (
                  <InfoRow label="Client since" value={new Date(client.clientSince).toLocaleDateString()} />
                )}
                {client.paymentMethod && <InfoRow label="Payment" value={client.paymentMethod} />}
                {client.mapCode && <InfoRow label="Map code" value={client.mapCode} />}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {/* Action buttons row */}
            <div className="flex items-center gap-1.5">
              {onExpandChange && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  title={expanded ? "Collapse" : "Expand to full page"}
                  onClick={() => onExpandChange(!expanded)}
                >
                  {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="mr-1 h-3 w-3" />
                Edit
              </Button>

              {/* Send split button */}
              <div className="flex items-center">
                <Button
                  size="sm"
                  className="h-7 rounded-r-none border-r-0 px-3 text-xs bg-brand-500 hover:bg-brand-600 text-white"
                  onClick={() => {
                    if (client.primaryEmail) setSendEmailOpen(true);
                    else toast.error("No email on file");
                  }}
                >
                  <Send className="mr-1 h-3 w-3" />
                  Send
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-7 rounded-l-none border-l border-l-white/20 px-1.5 text-xs bg-brand-500 hover:bg-brand-600 text-white">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => {
                      if (client.primaryEmail) setSendEmailOpen(true);
                      else toast.error("No email on file");
                    }}>
                      <Mail className="mr-2 h-3.5 w-3.5" /> Email
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      if (client.primaryPhone) window.location.href = `sms:${client.primaryPhone}`;
                      else toast.error("No phone on file");
                    }}>
                      <Phone className="mr-2 h-3.5 w-3.5" /> Text Message
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* More split button */}
              <div className="flex items-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-r-none border-r-0 px-3 text-xs"
                  onClick={() => setMoreMenuOpen(true)}
                >
                  <MoreHorizontal className="mr-1 h-3 w-3" />
                  More
                </Button>
                <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 rounded-l-none border-l-0 px-1.5 text-xs">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="text-xs text-slate-400 font-normal">More Options</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { if (client.billingAddress) window.open(`https://maps.google.com/?q=${encodeURIComponent(client.billingAddress + " " + client.billingCity)}`, "_blank"); else toast.error("No address on file"); }}>
                      <Map className="mr-2 h-3.5 w-3.5" /> Show Client on Map
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setAddContactOpen(true); }}>
                      <Plus className="mr-2 h-3.5 w-3.5" /> Add Contact
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setAddPropertyOpen(true); }}>
                      <Plus className="mr-2 h-3.5 w-3.5" /> Add Property
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setAerialMeasurementOpen(true); }}>
                      <Map className="mr-2 h-3.5 w-3.5" /> Aerial Measurement
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLinkParentOpen(true)}>
                      <Building2 className="mr-2 h-3.5 w-3.5" /> {client.parentClientId ? "Change Parent Account" : "Link Parent Account"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setNewTicketOpen(true)}>
                      <Ticket className="mr-2 h-3.5 w-3.5" /> Add Ticket
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPortalInviteOpen(true)}>
                      <ExternalLink className="mr-2 h-3.5 w-3.5" /> Send Portal Invite
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setActiveTab("audit")}>
                      <History className="mr-2 h-3.5 w-3.5" /> View Audit Trail
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setActiveTab("details")}>
                      <ClipboardList className="mr-2 h-3.5 w-3.5" /> Account Statement
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {client.status === "cancelled" ? (
                      <DropdownMenuItem onClick={async () => { try { await activate(clientId); toast.success("Client reactivated"); } catch { toast.error("Failed to activate"); } }}>
                        <CheckCircle className="mr-2 h-3.5 w-3.5 text-green-600" /> Activate Client
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setCancelOpen(true)}>
                        <Ban className="mr-2 h-3.5 w-3.5" /> Cancel Client
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="w-48 mt-4">
              <BalanceCard client={client} revenuePotentialCents={revenuePotentialCents} />
            </div>
          </div>
        </div>

      </div>

      {/* Parent account banner — shown when this client has a parent */}
      {client.parentClientId && (
        <div className="flex items-center justify-between border-b bg-indigo-50 px-6 py-2">
          <div className="flex items-center gap-2 text-sm text-indigo-700">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span>Sub-account of </span>
            <button
              className="font-semibold hover:underline"
              onClick={() => router.push(`/crm/clients/${client.parentClientId}`)}
            >
              {parentClient?.displayName ?? "…"}
            </button>
          </div>
          <button
            className="text-xs text-indigo-500 hover:underline"
            onClick={() => setLinkParentOpen(true)}
          >
            Change
          </button>
        </div>
      )}

      {/* Child accounts summary — shown when this client has sub-accounts */}
      {hasChildren && (
        <div className="border-b bg-slate-50 px-6 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">
                Sub-Accounts ({childClients!.length})
              </span>
              <Badge variant="secondary" className="text-xs">
                Combined balance: <span className={totalChildBalance > 0 ? "text-red-600 ml-1" : "ml-1"}>{formatCurrency(totalChildBalance)}</span>
              </Badge>
            </div>
            <button
              className="text-xs text-brand-600 hover:underline"
              onClick={() => setLinkParentOpen(true)}
            >
              Manage
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {childClients!.slice(0, 6).map((child) => (
              <button
                key={child.id}
                onClick={() => router.push(`/crm/clients/${child.id}`)}
                className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-left text-xs hover:border-brand-300 hover:bg-brand-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-700">{child.displayName}</p>
                  {child.billingCity && (
                    <p className="text-slate-400">{child.billingCity}, {child.billingState}</p>
                  )}
                </div>
                <div className="ml-2 shrink-0 text-right">
                  <p className={`font-medium ${child.balanceOutstandingCents > 0 ? "text-red-600" : "text-slate-500"}`}>
                    {formatCurrency(child.balanceOutstandingCents)}
                  </p>
                  <Badge variant="outline" className={`text-[9px] capitalize border ${STATUS_COLOR[child.status]}`}>
                    {child.status}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
          {childClients!.length > 6 && (
            <p className="mt-1.5 text-xs text-slate-400">+{childClients!.length - 6} more sub-accounts</p>
          )}
        </div>
      )}

      {/* Sub-panels: Properties + Contacts + Office Notes */}
      <div className="border-b bg-slate-50/60 px-6 py-4">
        <div className="grid grid-cols-3 gap-4">
        {/* Properties */}
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              Related Properties
              {(properties ?? []).length > 0 && (
                <span className="ml-1.5 text-slate-400">({(properties ?? []).length})</span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {(properties ?? []).length > 0 && (
                <button className="text-[10px] text-brand-600 hover:underline">All</button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs text-brand-600 hover:bg-brand-50"
                onClick={() => setAddPropertyOpen(true)}
              >
                <Plus className="mr-0.5 h-3 w-3" /> Add Property
              </Button>
            </div>
          </div>
          {(properties ?? []).length === 0 ? (
            <p className="text-xs text-slate-400 italic">No properties yet</p>
          ) : (
            <div className="space-y-1.5">
              {(properties ?? []).slice(0, 4).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
                  <div className="min-w-0">
                    {p.name && <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{p.name}</p>}
                    <span className="truncate text-slate-700">
                      {p.address || "Unnamed property"}
                      {p.city && `, ${p.city}`}
                    </span>
                  </div>
                  <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />
                </div>
              ))}
              {(properties ?? []).length > 4 && (
                <p className="text-xs text-slate-400">+{(properties ?? []).length - 4} more</p>
              )}
            </div>
          )}
        </div>

        {/* Contacts */}
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              Contacts
              {(contacts ?? []).length > 0 && (
                <span className="ml-1.5 text-slate-400">({(contacts ?? []).length})</span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {(contacts ?? []).length > 0 && (
                <button className="text-[10px] text-brand-600 hover:underline" onClick={() => setAllContactsOpen(true)}>All</button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs text-brand-600 hover:bg-brand-50"
                onClick={() => setAddContactOpen(true)}
              >
                <Plus className="mr-0.5 h-3 w-3" /> Add Contact
              </Button>
            </div>
          </div>
          {(contacts ?? []).length === 0 ? (
            <p className="text-xs text-slate-400 italic">No contacts yet</p>
          ) : (
            <div className="space-y-1.5">
              {(contacts ?? []).slice(0, 2).map((c) => (
                <div
                  key={c.id}
                  className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm cursor-pointer hover:border-brand-300 hover:bg-brand-50/30"
                  onClick={() => setEditContact(c)}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-slate-700">
                      {c.firstName} {c.lastName}
                    </span>
                    {c.contactType && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5 capitalize shrink-0">
                        {c.contactType}
                      </Badge>
                    )}
                  </div>
                  {(c.phones?.length > 0 ? c.phones : c.phone ? [{ phone: c.phone, type: c.phoneType ?? "cell", isPrimary: true }] : []).map((p, i) => (
                    <span key={i} className="text-slate-400 mr-2">{p.phone} <span className="text-[9px] text-slate-300 capitalize">({p.type})</span></span>
                  ))}
                  {c.email && <span className="block text-slate-400">{c.email}</span>}
                </div>
              ))}
              {(contacts ?? []).length > 2 && (
                <button
                  className="text-xs text-brand-600 hover:underline"
                  onClick={() => setAllContactsOpen(true)}
                >
                  +{(contacts ?? []).length - 2} more
                </button>
              )}
            </div>
          )}
        </div>

        {/* Office Notes */}
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Office Notes</span>
            <button
              className="text-[10px] text-brand-600 hover:underline"
              onClick={() => setEditOpen(true)}
            >
              Edit
            </button>
          </div>
          {client.officeNotes ? (
            <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">{client.officeNotes}</p>
          ) : (
            <p className="text-xs text-slate-400 italic">No office notes</p>
          )}
        </div>
        </div>{/* end grid */}
      </div>

      {/* Lead conversion banner */}
      {isLead && (
        <div className="flex items-center justify-between gap-4 border-b bg-yellow-50 px-6 py-2.5">
          <div className="flex items-center gap-2 text-sm text-yellow-800">
            <UserCheck className="h-4 w-4 shrink-0" />
            <span>This is a <strong>lead</strong>. Convert to a client to schedule jobs and create invoices.</span>
          </div>
          <Button
            size="sm"
            className="h-7 shrink-0 bg-yellow-600 text-xs text-white hover:bg-yellow-700"
            onClick={handleConvert}
            disabled={converting}
          >
            {converting ? "Converting…" : "Convert to Client"}
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
        <TabsList className="sticky top-0 z-10 shrink-0 justify-start rounded-none border-b bg-white px-4 py-0 h-10 gap-1">
          {(
            [
              { value: "home",      label: "Home" },
              { value: "activity",  label: "Activity" },
              { value: "tickets",   label: "Tickets" },
              ...(!isLeadLike ? [{ value: "contracts", label: "Contracts" }] : []),
              { value: "projects",  label: "Projects" },
              { value: "photos",    label: "Photos" },
              { value: "files",     label: "Files" },
              { value: "details",   label: "Details" },
              { value: "audit",     label: "Audit Trail" },
            ] as { value: string; label: string }[]
          ).map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="h-full rounded-none border-b-2 border-transparent px-4 py-0 text-sm data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="home" className="m-0 pt-2">
          <HomeTab clientId={clientId} isLead={isLeadLike} onSwitchTab={setActiveTab} />
        </TabsContent>

        <TabsContent value="activity" className="m-0 min-h-[500px]">
          <ActivityTimeline
            clientId={clientId}
            onTicketClick={(id) => setOpenTicketId(id)}
            onPaymentClick={(id) => setOpenPaymentId(id)}
            onInvoiceClick={(id) => setOpenInvoiceId(id)}
            onJobClick={(id, opts) => { setOpenJobId(id); setOpenJobInitialTab(opts?.openVisitsTab ? "visits" : undefined); }}
          />
        </TabsContent>

        <TabsContent value="tickets" className="m-0 p-4">
          <TicketsList clientId={clientId} />
        </TabsContent>

        <TabsContent value="contracts" className="m-0 p-4">
          <ContractsList clientId={clientId} />
        </TabsContent>

        <TabsContent value="projects" className="m-0 p-4">
          <ClientProjectsTab clientId={clientId} clientName={client.displayName} />
        </TabsContent>

        <TabsContent value="photos" className="m-0 p-4">
          <ClientPhotosTab clientId={clientId} clientName={client.displayName} />
        </TabsContent>

        <TabsContent value="files" className="m-0">
          <ClientFilesTab clientId={clientId} />
        </TabsContent>

        <TabsContent value="audit" className="m-0 p-4">
          <AuditTrailTab recordType="client" recordId={clientId} />
        </TabsContent>

        <TabsContent value="details" className="m-0 p-6">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Billing
              </h3>
              <div className="space-y-2">
                <InfoRow label="Invoice freq." value={client.invoiceFrequency?.replace("_", " ")} />
                <InfoRow label="Send by" value={client.invoiceDelivery} />
                <InfoRow label="Payment" value={client.paymentMethod} />
                <InfoRow label="Terms" value={client.billingTerms} />
                <InfoRow label="Taxable" value={client.isTaxable ? "Yes" : "No"} />
                <InfoRow label="Tax rate" value={client.defaultTaxRateBps > 0 ? `${(client.defaultTaxRateBps / 100).toFixed(2)}%` : "Org default"} />
                <InfoRow label="Invoice terms" value={client.defaultTerms?.replace(/_/g, " ")} />
                <InfoRow label="Tax code" value={client.salesTaxCode} />
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Property Details
              </h3>
              <div className="space-y-2">
                <InfoRow label="Turf sq ft" value={client.turfSqft?.toLocaleString()} />
                <InfoRow label="Mulch bed sq ft" value={client.mulchBedSqft?.toLocaleString()} />
                <InfoRow label="Gross sq ft" value={client.grossSqft?.toLocaleString()} />
                <InfoRow label="Perimeter ft" value={client.linearFtPerimeter?.toLocaleString()} />
                <InfoRow label="Linear ft edging" value={client.linearFtEdging?.toLocaleString()} />
                <InfoRow label="Yards of mulch" value={client.yardsOfMulch?.toLocaleString()} />
                <InfoRow label="Gate code" value={client.gateCode} />
                <InfoRow label="Notes to crew" value={client.notesToCrew} />
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {client && (
        <EditClientDialog client={client} open={editOpen} onOpenChange={setEditOpen} />
      )}
      {client?.primaryEmail && (
        <SendClientEmailDialog
          open={sendEmailOpen}
          onClose={() => setSendEmailOpen(false)}
          clientId={clientId}
          clientName={client.displayName}
          clientEmail={client.primaryEmail}
        />
      )}
      <CancelClientDialog
        clientId={clientId}
        clientName={client.displayName}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />

      <PortalInviteDialog
        clientId={clientId}
        defaultEmail={client.primaryEmail ?? ""}
        open={portalInviteOpen}
        onOpenChange={setPortalInviteOpen}
      />
      <ContactDialog clientId={clientId} open={addContactOpen} onOpenChange={setAddContactOpen} />
      <ContactDialog
        clientId={clientId}
        open={!!editContact}
        onOpenChange={(o) => { if (!o) setEditContact(null); }}
        contact={editContact}
      />
      {allContactsOpen && (
        <AllContactsModal
          contacts={contacts ?? []}
          onClose={() => setAllContactsOpen(false)}
          onOpenContact={(c) => { setAllContactsOpen(false); setEditContact(c); }}
          onAddContact={() => { setAllContactsOpen(false); setAddContactOpen(true); }}
        />
      )}
      <AddPropertyDialog clientId={clientId} open={addPropertyOpen} onOpenChange={setAddPropertyOpen} />
      <AerialMeasurementDialog clientId={clientId} open={aerialMeasurementOpen} onOpenChange={setAerialMeasurementOpen} />
      <NewTicketDialog open={newTicketOpen} onOpenChange={setNewTicketOpen} defaultClientId={clientId} />
      <LinkParentDialog
        clientId={clientId}
        currentParentId={client.parentClientId}
        open={linkParentOpen}
        onOpenChange={setLinkParentOpen}
      />

      <TicketDetailSheet
        ticket={openTicket ?? null}
        onClose={() => setOpenTicketId(null)}
      />
      <AddPaymentDialog
        open={!!openPaymentId}
        onOpenChange={(o) => { if (!o) setOpenPaymentId(null); }}
        payment={openPayment}
      />
      <InvoiceDetailSheet
        invoiceId={openInvoiceId}
        onOpenChange={(o) => { if (!o) setOpenInvoiceId(null); }}
      />
      <JobDetailSheet
        jobId={openJobId}
        initialTab={openJobInitialTab}
        onOpenChange={(o) => { if (!o) { setOpenJobId(null); setOpenJobInitialTab(undefined); } }}
      />
    </div>
  );
}

// ── PortalInviteDialog ────────────────────────────────────────────────────────

function PortalInviteDialog({
  clientId,
  defaultEmail,
  open,
  onOpenChange,
}: {
  clientId: string;
  defaultEmail: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasExisting, setHasExisting] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Sync whenever the dialog opens or the client's email changes
  useEffect(() => {
    if (open) setEmail(defaultEmail);
  }, [open, defaultEmail]);

  async function sendInvite() {
    setLoading(true);
    setError(null);
    setHasExisting(false);
    try {
      const res = await fetch(`/api/crm/clients/${clientId}/portal-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setHasExisting(true);
        setError("This client already has a portal account.");
      } else if (!res.ok) {
        setError(data.error ?? "Failed to create invite");
      } else {
        setResult({ url: data.inviteUrl });
      }
    } catch {
      setError("Failed to create invite — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resetAndInvite() {
    setResetting(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/clients/${clientId}/portal-reset`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to reset portal access");
        return;
      }
      setHasExisting(false);
    } catch {
      setError("Failed to reset portal access — check your connection and try again.");
      return;
    } finally {
      setResetting(false);
    }
    sendInvite();
  }

  function handleClose() {
    setResult(null);
    setError(null);
    setHasExisting(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Send Client Portal Invite
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-4 py-2">
            <p className="text-sm text-slate-600">Invite created. Share this link with your client:</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={result.url}
                className="flex-1 h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-mono text-slate-700"
              />
              <button
                onClick={() => { navigator.clipboard.writeText(result.url); toast.success("Link copied"); }}
                className="h-9 px-3 rounded-md bg-brand-500 text-white text-xs font-medium hover:bg-brand-600"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-slate-400">Link expires in 7 days. Once accepted, the client can log in at /portal/login.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <p className="text-sm text-slate-600">
              An invite link will be generated. The client sets their password and gets access to view invoices, services, and estimates.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">Client Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); setHasExisting(false); }}
                placeholder="client@example.com"
                className="h-9 rounded-md border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {error && (
              <div className="flex flex-col gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <p className="text-sm text-red-600">{error}</p>
                {hasExisting && (
                  <button
                    onClick={resetAndInvite}
                    disabled={resetting}
                    className="self-start text-xs font-medium text-red-700 underline hover:no-underline disabled:opacity-50"
                  >
                    {resetting ? "Resetting…" : "Revoke existing access and send new invite"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Close</Button>
          {!result && (
            <Button onClick={sendInvite} disabled={loading || resetting || !email}>
              {loading ? "Creating…" : "Generate Invite Link"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
