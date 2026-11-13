import type { Client } from "@/types/crm";
import type { CRMInvoice, CRMPayment } from "@/types/crm-invoices";
import type { Estimate } from "@/types/crm-estimates";
import type { CRMService } from "@/types/crm-jobs";

/**
 * CSV column lists and export rows shared by each list page's Import / Export
 * menu AND Settings → Import / Export. The Settings tiles used to carry their
 * own, shorter copies, so a file imported there silently dropped columns the
 * page importer reads (a client's status/client-since/tags/parent, an
 * invoice's discount, an estimate's amount/rep) — clients came in as "active"
 * and discounted invoices were overstated. One list, two entry points.
 */

// status, clientSince, names, billing email, notes, tags (separate with |) and the parent's
// account number make a Service Autopilot export — and our own export — round-trip intact.
export const CLIENT_TEMPLATE_COLUMNS = [
  "displayName", "firstName", "lastName", "accountType", "status", "clientSince",
  "primaryPhone", "primaryEmail", "billingEmail",
  "billingAddress", "billingCity", "billingState", "billingZip",
  "serviceAddress", "serviceCity", "serviceState", "serviceZip",
  "source", "accountNumber", "parentAccountNumber", "tags", "notesToCrew",
];
export const CLIENT_REQUIRED_COLUMNS = ["displayName"];

export const LEAD_TEMPLATE_COLUMNS = [
  "displayName", "accountType", "primaryPhone", "primaryEmail",
  "billingAddress", "billingCity", "billingState", "billingZip", "source",
];
export const LEAD_REQUIRED_COLUMNS = ["displayName"];

export const ESTIMATE_TEMPLATE_COLUMNS = [
  "clientName", "description", "estimateDate", "validUntilDate", "poNumber", "stage",
  // Optional: carry a source system's estimate over with its total, rep and probability.
  "amount", "salesperson", "probability", "externalRef",
];
export const ESTIMATE_REQUIRED_COLUMNS = ["clientName", "description"];

// invoiceNumber (optional) lets a re-imported export skip invoices that already exist.
export const INVOICE_TEMPLATE_COLUMNS = [
  "clientName", "service", "description", "invoiceDate", "dueDate", "poNumber", "status", "amount", "discount", "taxAmount", "invoiceNumber",
];
export const INVOICE_REQUIRED_COLUMNS = ["clientName", "service", "description", "amount"];

// accountNumber (optional) disambiguates clients that share a display name.
// "deleted" is filled in only by an export from the Payments Deleted tab; the
// importer skips any row where it is set, so deleted payments never come back.
export const PAYMENT_TEMPLATE_COLUMNS = ["clientName", "accountNumber", "amount", "paymentDate", "method", "reference", "memo", "invoiceNumber", "deleted"];
export const PAYMENT_REQUIRED_COLUMNS = ["clientName", "amount"];

export const TICKET_TEMPLATE_COLUMNS = ["subject", "clientName", "type", "status", "priority", "category", "body", "dueDate"];
export const TICKET_REQUIRED_COLUMNS = ["subject"];

export const SERVICE_TEMPLATE_COLUMNS = [
  "name", "code", "category", "unit", "defaultRate", "productionRate", "isActive",
];
export const SERVICE_REQUIRED_COLUMNS = ["name"];

export const SCHEDULE_TEMPLATE_COLUMNS = [
  "name", "frequency", "dayOfWeek", "weekPattern", "anchorDate", "seasonStart", "seasonEnd", "weekOfMonth", "customDates", "excludedDates",
];
export const SCHEDULE_REQUIRED_COLUMNS = ["name", "frequency"];

export const EMPLOYEE_TEMPLATE_COLUMNS = [
  "firstName", "lastName", "email", "phone", "cellPhone",
  "address", "city", "state", "zip", "dateHired", "resourceCode", "hourlyRate",
];
export const EMPLOYEE_REQUIRED_COLUMNS = ["firstName", "lastName"];

const money = (cents: number | null | undefined) => ((cents ?? 0) / 100).toFixed(2);

/** One client export row. `accountById` resolves parentClientId → the parent's account number. */
export function clientToCsvRow(c: Client, accountById: Map<string, string>): Record<string, string> {
  return {
    displayName: c.displayName,
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    accountType: c.accountType,
    status: c.status,
    clientSince: c.clientSince ?? "",
    primaryPhone: c.primaryPhone ?? "",
    primaryEmail: c.primaryEmail ?? "",
    billingEmail: c.billingEmail ?? "",
    billingAddress: c.billingAddress ?? "",
    billingCity: c.billingCity ?? "",
    billingState: c.billingState ?? "",
    billingZip: c.billingZip ?? "",
    serviceAddress: c.serviceAddress ?? "",
    serviceCity: c.serviceCity ?? "",
    serviceState: c.serviceState ?? "",
    serviceZip: c.serviceZip ?? "",
    source: c.source ?? "",
    accountNumber: c.accountNumber ?? "",
    parentAccountNumber: c.parentClientId ? accountById.get(c.parentClientId) ?? "" : "",
    tags: (c.tags ?? []).join("|"),
    notesToCrew: c.notesToCrew ?? "",
  };
}

export function leadToCsvRow(c: Client): Record<string, string> {
  return {
    displayName: c.displayName,
    accountType: c.accountType,
    primaryPhone: c.primaryPhone ?? "",
    primaryEmail: c.primaryEmail ?? "",
    billingAddress: c.billingAddress ?? "",
    billingCity: c.billingCity ?? "",
    billingState: c.billingState ?? "",
    billingZip: c.billingZip ?? "",
    source: c.source ?? "",
  };
}

export function estimateToCsvRow(e: Estimate): Record<string, string> {
  return {
    clientName: e.clientName ?? "",
    description: e.description,
    estimateDate: e.estimateDate,
    validUntilDate: e.validUntilDate ?? "",
    poNumber: e.poNumber ?? "",
    stage: e.stage,
  };
}

/**
 * The catalog service an exported invoice bills, so the file can be imported back
 * (the invoice importer requires `service`). The importer brings an invoice in as one
 * line, so this is the invoice's service when every line bills the same one, else the
 * first line's (by sort order). Blank when the invoice has no service lines.
 */
function invoiceServiceName(inv: CRMInvoice): string {
  const lines = [...(inv.lineItems ?? [])]
    .filter((l) => !l.isOtherCharge)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const names = lines.map((l) => (l.serviceName ?? "").trim()).filter(Boolean);
  return names[0] ?? "";
}

export function invoiceToCsvRow(inv: CRMInvoice): Record<string, string> {
  return {
    clientName: inv.clientName ?? "",
    service: invoiceServiceName(inv),
    description: inv.description,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate ?? "",
    poNumber: inv.poNumber ?? "",
    status: inv.status,
    amount: money(inv.subtotalCents),
    // Invoice-level discount — without it a re-import overstated every discounted invoice's total.
    discount: money(inv.discountCents),
    taxAmount: money(inv.taxCents),
    // Lets a re-import of this file skip the invoices that already exist.
    invoiceNumber: inv.invoiceNumber != null ? String(inv.invoiceNumber) : "",
  };
}

export function paymentToCsvRow(p: CRMPayment): Record<string, string> {
  return {
    clientName: p.clientName ?? "",
    amount: money(p.amountCents),
    paymentDate: p.paymentDate,
    method: p.method,
    reference: p.reference ?? "",
    memo: p.memo ?? "",
    invoiceNumber: p.invoiceNumber != null ? String(p.invoiceNumber) : "",
  };
}

export function serviceToCsvRow(s: CRMService): Record<string, string> {
  return {
    name: s.name,
    code: s.code ?? "",
    category: s.category,
    unit: s.unit,
    defaultRate: s.defaultRateCents != null ? (s.defaultRateCents / 100).toFixed(2) : "",
    productionRate: s.productionRateSqftPerHr != null ? String(s.productionRateSqftPerHr) : "",
    isActive: s.isActive ? "yes" : "no",
  };
}

/** The client / lead importers' opt-in: fire Lead created / Client created for the new records. */
export const IMPORT_AUTOMATIONS_OPTION = {
  label: "Run automations for imported records",
  hint: "New leads fire Lead created and new active clients fire Client created — your Communication Automations and Zapier run as if each was added by hand. Off by default; records that match an existing client never fire.",
} as const;
