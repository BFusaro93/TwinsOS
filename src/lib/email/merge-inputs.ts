import type { ClientForMergeVars, OrgForMergeVars } from "@/lib/email/send";

// Shared row → buildClientMergeVars inputs for routes that send a document
// about one client (estimate email, proposal page/PDF, chemical notice). Each
// route used to hand-build a short tag list, so most tags the Documents picker
// offers ([clientname], [companyphone], addresses, phones, takeoffs,
// [salesperson], [today]...) resolved blank on a real send.

/** Embed under a `clients(...)` select. */
export const MERGE_CLIENT_COLUMNS = `
  display_name, first_name, last_name, primary_email, billing_email, primary_phone, phones,
  account_number, invoice_delivery, balance_outstanding_cents,
  billing_address, billing_city, billing_state, billing_zip,
  service_address, service_city, service_state, service_zip,
  turf_sqft, gross_sqft, mulch_bed_sqft, yards_of_mulch,
  linear_ft_perimeter, linear_ft_edging, gate_lock_code, notes_to_crew, referred_by,
  referring_client:referred_by_client_id(display_name)
`;

/** Embed under a `client_properties(...)` select. */
export const MERGE_PROPERTY_COLUMNS = `
  address, city, state, zip, turf_sqft, gross_sqft, mulch_bed_sqft, yards_of_mulch,
  linear_ft_perimeter, linear_ft_edging, gate_lock_code, notes_to_crew
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any> | null | undefined;

const pick = <T>(propertyValue: T | null | undefined, clientValue: T | null | undefined): T | null =>
  propertyValue ?? clientValue ?? null;

/**
 * The record's own property wins over the client's service address and
 * takeoffs: a document about work at a property should name that property.
 */
export function clientMergeInput(
  client: Row,
  opts: { property?: Row; salesRepName?: string | null } = {}
): ClientForMergeVars {
  const c = client ?? {};
  const p = opts.property ?? null;
  const usesProperty = !!p?.address;
  const phones = Array.isArray(c.phones) && c.phones.length
    ? c.phones
    : c.primary_phone
      ? [{ phone: c.primary_phone as string, type: "cell" }]
      : null;
  return {
    displayName: c.display_name ?? null,
    firstName: c.first_name ?? null,
    lastName: c.last_name ?? null,
    balanceOutstandingCents: c.balance_outstanding_cents ?? null,
    primaryEmail: c.primary_email ?? c.billing_email ?? null,
    phones,
    accountNumber: c.account_number ?? null,
    invoiceDelivery: c.invoice_delivery ?? null,
    billingAddress: c.billing_address ?? null,
    billingCity: c.billing_city ?? null,
    billingState: c.billing_state ?? null,
    billingZip: c.billing_zip ?? null,
    serviceAddress: usesProperty ? p!.address : c.service_address ?? null,
    serviceCity: usesProperty ? p!.city ?? null : c.service_city ?? null,
    serviceState: usesProperty ? p!.state ?? null : c.service_state ?? null,
    serviceZip: usesProperty ? p!.zip ?? null : c.service_zip ?? null,
    turfSqft: pick(p?.turf_sqft, c.turf_sqft),
    grossSqft: pick(p?.gross_sqft, c.gross_sqft),
    mulchBedSqft: pick(p?.mulch_bed_sqft, c.mulch_bed_sqft),
    yardsOfMulch: pick(p?.yards_of_mulch, c.yards_of_mulch),
    linearFtPerimeter: pick(p?.linear_ft_perimeter, c.linear_ft_perimeter),
    linearFtEdging: pick(p?.linear_ft_edging, c.linear_ft_edging),
    gateLockCode: pick(p?.gate_lock_code, c.gate_lock_code),
    notesToCrew: pick(p?.notes_to_crew, c.notes_to_crew),
    salesRepName: opts.salesRepName ?? null,
    referringClientName: (c.referring_client as { display_name?: string } | null)?.display_name ?? c.referred_by ?? null,
  };
}

export function orgMergeInput(
  org: { name?: string | null; address?: unknown } | null | undefined,
  timeZone: string
): OrgForMergeVars {
  const addr = ((org?.address as Record<string, string> | null) ?? {});
  return {
    name: org?.name ?? null,
    addressPhone: addr.phone ?? null,
    addressStreet: addr.street ?? null,
    addressCity: addr.city ?? null,
    addressState: addr.state ?? null,
    addressZip: addr.zip ?? null,
    timeZone,
  };
}

/** "First Last" of an embedded crm_employees row, or null. */
export function employeeName(rep: Row): string | null {
  if (!rep) return null;
  return `${rep.first_name ?? ""} ${rep.last_name ?? ""}`.trim() || null;
}
