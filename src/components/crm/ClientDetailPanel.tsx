"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  useAddClientProperty,
} from "@/lib/hooks/use-clients";
import { useTicket } from "@/lib/hooks/use-tickets";
import { useClientJobs } from "@/lib/hooks/use-crm-jobs";
import { useInvoices, usePayments } from "@/lib/hooks/use-invoices";
import { useEstimates } from "@/lib/hooks/use-estimates";
import { useContracts } from "@/lib/hooks/use-contracts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { NewJobDialog } from "./jobs/NewJobDialog";
import { InvoiceDetailSheet } from "./invoices/InvoiceDetailSheet";
import { ContractsList } from "./contracts/ContractsList";
import { NewContractDialog } from "./contracts/NewContractDialog";
import { ClientFilesTab } from "./ClientFilesTab";
import {
  useCustomFieldDefs,
  useClientCustomFieldValues,
  useUpsertClientCustomFieldValue,
} from "@/lib/hooks/use-client-custom-fields";
import { useOrgList } from "@/lib/hooks/use-org-lists";
import { formatCurrency } from "@/lib/utils";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import type { CRMPayment } from "@/types/crm-invoices";
import { toast } from "sonner";
import {
  Phone,
  Mail,
  MapPin,
  Building2,
  Home,
  Plus,
  ChevronRight,
  UserCheck,
  Pencil,
  Send,
  ChevronDown,
  MoreHorizontal,
  Ticket,
  Map,
  Ban,
  ClipboardList,
  History,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { Client } from "@/types/crm";
import type { CRMJob } from "@/types/crm-jobs";

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
};

function BalanceCard({ client }: { client: Client }) {
  const outstanding = client.balanceOutstandingCents;
  const isRed = outstanding > 0;

  return (
    <div className={`rounded-lg border p-4 ${isRed ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
      <p className={`text-2xl font-bold ${isRed ? "text-red-600" : "text-slate-700"}`}>
        {formatCurrency(outstanding)}
      </p>
      <p className={`text-xs font-medium ${isRed ? "text-red-500" : "text-slate-500"}`}>
        Outstanding
      </p>
      <div className="mt-3 space-y-1 text-xs text-slate-500">
        <div className="flex justify-between">
          <span>Uninvoiced</span>
          <span>{formatCurrency(client.balanceUninvoicedCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>Credits</span>
          <span>{formatCurrency(client.balanceCreditsCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>Prepayments</span>
          <span>{formatCurrency(client.balancePrepaymentsCents)}</span>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="w-32 shrink-0 text-slate-400">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

// ── PaymentDetailDialog ───────────────────────────────────────────────────────

function PaymentDetailDialog({ payment, onClose }: { payment: CRMPayment | null; onClose: () => void }) {
  if (!payment) return null;
  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Payment Details</DialogTitle>
        </DialogHeader>
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
          {payment.reference && (
            <div className="flex justify-between">
              <span className="text-slate-400">Reference / Check #</span>
              <span>{payment.reference}</span>
            </div>
          )}
          {payment.invoiceNumber && (
            <div className="flex justify-between">
              <span className="text-slate-400">Invoice #</span>
              <span>#{payment.invoiceNumber}</span>
            </div>
          )}
          {payment.memo && (
            <div className="flex justify-between">
              <span className="text-slate-400">Memo</span>
              <span className="text-right max-w-[180px]">{payment.memo}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── EditClientDialog ──────────────────────────────────────────────────────────

const PAYMENT_METHOD_OPTIONS = [
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
  clients,
  placeholder = "Search clients or type name…",
}: {
  value: string;
  onChange: (v: string) => void;
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
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
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
              onMouseDown={() => { setQuery(c.displayName); onChange(c.displayName); setOpen(false); }}
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
  const { data: fieldDefs = [] } = useCustomFieldDefs();
  const { data: fieldValues = [] } = useClientCustomFieldValues(client.id);
  const { mutateAsync: upsertFieldValue } = useUpsertClientCustomFieldValue();
  const { data: allClients = [] } = useClients();
  const { data: sourcesOptions = [] } = useOrgList("client_sources");
  const { data: orgSettings } = useOrgSettings();

  const [editTab, setEditTab] = useState("personal");
  const [billingSameAsService, setBillingSameAsService] = useState(client.billingSameAsService ?? true);

  const [form, setForm] = useState({
    displayName: client.displayName,
    firstName: client.firstName ?? "",
    lastName: client.lastName ?? "",
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

  const [customValues, setCustomValues] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    fieldValues.forEach((v) => {
      map[v.fieldDefId] = v.valueNumber != null ? String(v.valueNumber) : (v.valueText ?? "");
    });
    return map;
  });

  function patch(k: keyof typeof form, v: string | number | boolean) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSave() {
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

      await update({
        id: client.id,
        updates: {
          ...form,
          ...serviceAddr,
          ...billingAddr,
          billingSameAsService,
          firstName: form.firstName || null,
          lastName: form.lastName || null,
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
      toast.error("Failed to update client");
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
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Phone</Label>
                  <Input type="tel" value={form.primaryPhone} onChange={(e) => patch("primaryPhone", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.primaryEmail} onChange={(e) => patch("primaryEmail", e.target.value)} />
                </div>
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
                  <Label>Source</Label>
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
                  clients={allClients.filter((c) => c.id !== client.id)}
                />
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
            <Button onClick={handleSave} disabled={isPending}>{isPending ? "Saving…" : "Save Changes"}</Button>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── AddContactDialog ──────────────────────────────────────────────────────────

function AddContactDialog({ clientId, open, onOpenChange }: { clientId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { mutateAsync: addContact, isPending } = useAddClientContact();
  const [form, setForm] = useState({
    firstName: "", lastName: "", contactType: "", email: "",
    phone: "", phoneType: "cell" as const,
    isPrimary: false, okToEmail: false, notes: "",
  });

  function patch(k: keyof typeof form, v: string | boolean) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSave() {
    if (!form.firstName.trim()) { toast.error("First name is required"); return; }
    try {
      await addContact({
        clientId,
        contact: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim() || null,
          contactType: form.contactType || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          phoneType: form.phoneType || null,
          isPrimary: form.isPrimary,
          okToEmail: form.okToEmail,
          notes: form.notes.trim() || null,
        },
      });
      toast.success("Contact added");
      setForm({ firstName: "", lastName: "", contactType: "", email: "", phone: "", phoneType: "cell", isPrimary: false, okToEmail: false, notes: "" });
      onOpenChange(false);
    } catch { toast.error("Failed to add contact"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>First Name *</Label>
              <Input value={form.firstName} onChange={(e) => patch("firstName", e.target.value)} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Last Name</Label>
              <Input value={form.lastName} onChange={(e) => patch("lastName", e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Contact Type</Label>
            <Select value={form.contactType} onValueChange={(v) => patch("contactType", v)}>
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
            <Input type="email" value={form.email} onChange={(e) => patch("email", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Phone</Label>
              <Input type="tel" value={form.phone} onChange={(e) => patch("phone", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={form.phoneType} onValueChange={(v) => patch("phoneType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cell">Cell</SelectItem>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.isPrimary} onChange={(e) => patch("isPrimary", e.target.checked)} className="rounded" />
              Primary contact
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.okToEmail} onChange={(e) => patch("okToEmail", e.target.checked)} className="rounded" />
              OK to email
            </label>
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
  const [jobFilter, setJobFilter] = useState<"all" | "upcoming" | "history">("all");
  const [newEstimateOpen, setNewEstimateOpen] = useState(false);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJobType, setNewJobType] = useState<import("@/types/crm-jobs").JobType>("one_time");
  const [newContractOpen, setNewContractOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  const { data: allJobs } = useClientJobs(clientId);
  const { data: invoices } = useInvoices(clientId);
  const { data: payments } = usePayments(clientId);
  const { data: estimates } = useEstimates(clientId);
  const { data: contracts } = useContracts(clientId);

  const jobs = (allJobs ?? []).filter((j) => {
    if (jobFilter === "upcoming") return j.status !== "completed" && j.status !== "cancelled";
    if (jobFilter === "history") return j.status === "completed";
    return true;
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
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 15);

  const openEstimates = (estimates ?? []).filter(
    (e) => e.stage !== "won" && e.stage !== "lost"
  );

  if (isLead) {
    // Leads only show the estimates column — full width
    const openEstimates = (estimates ?? []).filter((e) => e.stage !== "won" && e.stage !== "lost");
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
        <div className="flex-1 overflow-y-auto divide-y">
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
    <div className="grid h-full grid-cols-3 gap-0 overflow-hidden divide-x">
      {/* Left — Jobs */}
      <div className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-slate-800">Jobs</span>
            <Badge variant="secondary" className="text-xs">{(allJobs ?? []).length}</Badge>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-brand-600">
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

        {/* Filter chips */}
        <div className="flex gap-1 border-b px-4 py-1.5">
          {(["all", "upcoming", "history"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setJobFilter(f)}
              className={`rounded px-2 py-0.5 text-xs capitalize font-medium transition-colors ${
                jobFilter === f
                  ? "bg-brand-100 text-brand-700"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {jobs.length === 0 ? (
            <p className="px-4 py-6 text-xs text-slate-400 text-center">No jobs</p>
          ) : (
            <div className="divide-y">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full text-left border-l-4 px-3 py-2.5 hover:bg-slate-50 ${jobBorderColor(job)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold capitalize text-slate-800">
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
                          {new Date(job.scheduledDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Middle — Accounting */}
      <div className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="font-semibold text-sm text-slate-800">Accounting</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-brand-600">
            <Plus className="mr-0.5 h-3 w-3" /> Add a Transaction
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y">
          {accountingRows.length === 0 ? (
            <p className="px-4 py-6 text-xs text-slate-400 text-center">No transactions</p>
          ) : (
            accountingRows.map((row) =>
              row.kind === "invoice" ? (
                <div key={`inv-${row.id}`} className="border-l-4 border-l-yellow-400 px-3 py-2.5 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelectedInvoiceId(row.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <button
                      className="text-xs font-semibold text-slate-800 hover:text-brand-600"
                    >
                      Invoice #{row.invoiceNumber}
                    </button>
                    <p className="shrink-0 text-[10px] text-slate-400">
                      {new Date(row.date).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    Amt: {formatCurrency(row.totalCents)} | Bal: {formatCurrency(row.balanceCents)}
                  </p>
                </div>
              ) : (
                <button
                  key={`pmt-${row.id}`}
                  onClick={() => setSelectedPaymentId(row.id)}
                  className="w-full text-left border-l-4 border-l-green-400 px-3 py-2.5 hover:bg-green-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800">Payment</p>
                    <p className="shrink-0 text-[10px] text-slate-400">
                      {new Date(row.date).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="text-xs font-medium text-green-600">
                    {formatCurrency(row.amountCents)}
                  </p>
                </button>
              )
            )
          )}
        </div>
      </div>

      {/* Right — Estimates + Contracts */}
      <div className="flex flex-col overflow-hidden divide-y">
        {/* Estimates */}
        <div className="flex flex-col overflow-hidden" style={{ flex: "1 1 50%" }}>
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-slate-800">
                Open Estimates ({openEstimates.length})
              </span>
              <button className="text-xs text-brand-600 hover:underline">All</button>
            </div>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-brand-600"
              onClick={() => setNewEstimateOpen(true)}>
              <Plus className="mr-0.5 h-3 w-3" /> Add an Estimate
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y">
            {openEstimates.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-400 text-center">No open estimates</p>
            ) : (
              openEstimates.map((est) => (
                <button key={est.id} className="w-full text-left px-3 py-2 hover:bg-slate-50"
                  onClick={() => setSelectedEstimateId(est.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Badge variant="outline" className="text-[10px] capitalize mb-0.5">
                        {est.stage}
                      </Badge>
                      <p className="truncate text-xs text-slate-700">{est.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium text-slate-700">
                        {formatCurrency(est.totalCents)}
                      </p>
                      <p className="text-[10px] text-slate-400">
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
        <div className="flex flex-col overflow-hidden" style={{ flex: "1 1 50%" }}>
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-slate-800">
                Contracts ({(contracts ?? []).length})
              </span>
              <button className="text-xs text-brand-600 hover:underline" onClick={() => onSwitchTab?.("contracts")}>All</button>
            </div>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-brand-600"
              onClick={() => setNewContractOpen(true)}>
              <Plus className="mr-0.5 h-3 w-3" /> Add a Contract
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y">
            {(contracts ?? []).length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-400 text-center">No contracts</p>
            ) : (
              (contracts ?? []).map((contract) => (
                <div key={contract.id} className="px-3 py-2 hover:bg-slate-50">
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
      onOpenChange={(open) => !open && setSelectedJobId(null)}
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
    <NewContractDialog
      open={newContractOpen}
      onOpenChange={setNewContractOpen}
      clientId={clientId}
    />
    </>
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
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [linkParentOpen, setLinkParentOpen] = useState(false);
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const { mutateAsync: convertLead, isPending: converting } = useConvertLeadToClient();
  const { data: openTicket } = useTicket(openTicketId ?? "");
  const router = useRouter();
  const isLead = client?.status === "lead";
  const hasChildren = (childClients ?? []).length > 0;
  const totalChildBalance = (childClients ?? []).reduce((sum, c) => sum + c.balanceOutstandingCents, 0);

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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {client.accountType === "commercial" ? (
                <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
              ) : (
                <Home className="h-4 w-4 shrink-0 text-slate-400" />
              )}
              <h2 className="truncate text-xl font-semibold text-slate-900">{client.displayName}</h2>
              <Badge className={`shrink-0 capitalize border ${STATUS_COLOR[client.status]}`}>
                {client.status}
              </Badge>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              {client.primaryPhone && (
                <a
                  href={`tel:${client.primaryPhone}`}
                  className="flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {client.primaryPhone}
                </a>
              )}
              {client.primaryEmail && (
                <a
                  href={`mailto:${client.primaryEmail}`}
                  className="flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {client.primaryEmail}
                </a>
              )}
              {address && (
                <span className="flex items-center gap-1 text-sm text-slate-500">
                  <MapPin className="h-3.5 w-3.5" />
                  {address}
                </span>
              )}
            </div>

            {(client.tags ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {client.tags!.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
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
                  className="h-7 rounded-r-none border-r-0 px-3 text-xs"
                  onClick={() => {
                    if (client.primaryEmail) window.location.href = `mailto:${client.primaryEmail}`;
                    else toast.error("No email on file");
                  }}
                >
                  <Send className="mr-1 h-3 w-3" />
                  Send
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-7 rounded-l-none border-l border-l-white/20 px-1.5 text-xs">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => {
                      if (client.primaryEmail) window.location.href = `mailto:${client.primaryEmail}`;
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
                <Button variant="outline" size="sm" className="h-7 rounded-r-none border-r-0 px-3 text-xs">
                  <MoreHorizontal className="mr-1 h-3 w-3" />
                  More
                </Button>
                <DropdownMenu>
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
                    <DropdownMenuItem onClick={() => setLinkParentOpen(true)}>
                      <Building2 className="mr-2 h-3.5 w-3.5" /> {client.parentClientId ? "Change Parent Account" : "Link Parent Account"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setNewTicketOpen(true)}>
                      <Ticket className="mr-2 h-3.5 w-3.5" /> Add Ticket
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setActiveTab("audit")}>
                      <History className="mr-2 h-3.5 w-3.5" /> View Audit Trail
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setActiveTab("details")}>
                      <ClipboardList className="mr-2 h-3.5 w-3.5" /> Account Statement
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-red-600 focus:text-red-600">
                      <Ban className="mr-2 h-3.5 w-3.5" /> Cancel Client
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="w-48">
              <BalanceCard client={client} />
            </div>
          </div>
        </div>

        {/* Quick info strip */}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          {client.source && <InfoRow label="Source" value={client.source} />}
          {client.clientSince && (
            <InfoRow label="Client since" value={new Date(client.clientSince).toLocaleDateString()} />
          )}
          {client.paymentMethod && <InfoRow label="Payment" value={client.paymentMethod} />}
          {client.mapCode && <InfoRow label="Map code" value={client.mapCode} />}
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
                  <Badge className={`text-[9px] capitalize border ${STATUS_COLOR[child.status]}`}>
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

      {/* Sub-panels: Properties + Contacts quick view */}
      <div className="grid grid-cols-2 border-b">
        {/* Properties */}
        <div className="border-r bg-slate-50/60 px-4 py-3">
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
        <div className="bg-slate-50/60 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              Contacts
              {(contacts ?? []).length > 0 && (
                <span className="ml-1.5 text-slate-400">({(contacts ?? []).length})</span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {(contacts ?? []).length > 0 && (
                <button className="text-[10px] text-brand-600 hover:underline">All</button>
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
              {(contacts ?? []).slice(0, 4).map((c) => (
                <div key={c.id} className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
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
                  {c.phone && <span className="text-slate-400">{c.phone}</span>}
                  {c.email && <span className="ml-2 text-slate-400">{c.email}</span>}
                </div>
              ))}
              {(contacts ?? []).length > 4 && (
                <p className="text-xs text-slate-400">+{(contacts ?? []).length - 4} more</p>
              )}
            </div>
          )}
        </div>
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="shrink-0 justify-start rounded-none border-b bg-white px-4 py-0 h-10 gap-1">
          {(
            [
              { value: "home",      label: "Home" },
              { value: "activity",  label: "Activity" },
              { value: "tickets",   label: "Tickets" },
              ...(!isLead ? [{ value: "contracts", label: "Contracts" }] : []),
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

        <TabsContent value="home" className="flex-1 overflow-hidden m-0">
          <HomeTab clientId={clientId} isLead={isLead} onSwitchTab={setActiveTab} />
        </TabsContent>

        <TabsContent value="activity" className="flex-1 overflow-hidden m-0">
          <ActivityTimeline clientId={clientId} onTicketClick={(id) => setOpenTicketId(id)} />
        </TabsContent>

        <TabsContent value="tickets" className="flex-1 overflow-auto m-0 p-4">
          <TicketsList clientId={clientId} />
        </TabsContent>

        <TabsContent value="contracts" className="flex-1 overflow-auto m-0 p-4">
          <ContractsList clientId={clientId} />
        </TabsContent>

        <TabsContent value="files" className="flex-1 overflow-auto m-0">
          <ClientFilesTab clientId={clientId} />
        </TabsContent>

        <TabsContent value="audit" className="flex-1 overflow-auto m-0 p-4">
          <AuditTrailTab recordType="client" recordId={clientId} />
        </TabsContent>

        <TabsContent value="details" className="flex-1 overflow-auto m-0 p-6">
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

      <AddContactDialog clientId={clientId} open={addContactOpen} onOpenChange={setAddContactOpen} />
      <AddPropertyDialog clientId={clientId} open={addPropertyOpen} onOpenChange={setAddPropertyOpen} />
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
    </div>
  );
}
