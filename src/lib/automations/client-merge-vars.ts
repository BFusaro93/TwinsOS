import { buildClientMergeVars } from "@/lib/email/send";
import { getOrgTimeZone } from "@/lib/time/org-timezone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface AutomationClientRow {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  billing_email: string | null;
  primary_phone: string | null;
  phones: { phone: string; type: string }[] | null;
  sms_opt_in: boolean | null;
  do_not_market: boolean | null;
  ok_to_email: boolean | null;
  email_bounced_at: string | null;
  sales_rep_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

const CLIENT_COLUMNS = `
  id, display_name, first_name, last_name, primary_email, billing_email, primary_phone, phones,
  sms_opt_in, do_not_market, ok_to_email, email_bounced_at, sales_rep_id,
  account_number, invoice_delivery, balance_outstanding_cents,
  billing_address, billing_city, billing_state, billing_zip,
  service_address, service_city, service_state, service_zip,
  turf_sqft, gross_sqft, mulch_bed_sqft, yards_of_mulch,
  linear_ft_perimeter, linear_ft_edging, gate_lock_code, notes_to_crew, referred_by,
  sales_rep:crm_employees!clients_sales_rep_id_fkey(first_name,last_name),
  referring_client:referred_by_client_id(display_name)
`;

/**
 * Loads the client + org context an automation step needs and builds the
 * full merge-tag maps via the shared buildClientMergeVars (same vocabulary
 * campaigns use). `html` is HTML-escaped (email body); `text` is raw (email
 * subject, SMS). `extras` are step-specific tags (meeting/estimate/card)
 * layered on top, supplied raw.
 */
export async function loadAutomationClient(
  supabase: AnyClient,
  params: { orgId: string; clientId: string }
): Promise<{ client: AutomationClientRow; orgName: string } | null> {
  const { data: client } = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .eq("id", params.clientId)
    .single();
  if (!client) return null;
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", params.orgId)
    .single();
  return { client: client as AutomationClientRow, orgName: (orgRow?.name as string | null) ?? "Your Service Provider" };
}

export async function buildAutomationMergeVars(
  supabase: AnyClient,
  params: {
    orgId: string;
    client: AutomationClientRow;
    extras: Record<string, string>;
    escapeHtml: (s: string) => string;
  }
): Promise<{ html: Record<string, string>; text: Record<string, string> }> {
  const { client } = params;
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name, address")
    .eq("id", params.orgId)
    .single();
  const address = (orgRow?.address ?? null) as {
    phone?: string; street?: string; city?: string; state?: string; zip?: string;
  } | null;
  const timeZone = await getOrgTimeZone(supabase, params.orgId);

  const rep = client.sales_rep as { first_name: string; last_name: string } | null;
  const referring = client.referring_client as { display_name: string } | null;
  const mergeClient = {
    displayName: client.display_name,
    firstName: client.first_name,
    lastName: client.last_name,
    balanceOutstandingCents: client.balance_outstanding_cents as number | null,
    primaryEmail: client.primary_email ?? client.billing_email,
    phones: client.phones,
    accountNumber: client.account_number as string | null,
    invoiceDelivery: client.invoice_delivery as string | null,
    billingAddress: client.billing_address as string | null,
    billingCity: client.billing_city as string | null,
    billingState: client.billing_state as string | null,
    billingZip: client.billing_zip as string | null,
    serviceAddress: client.service_address as string | null,
    serviceCity: client.service_city as string | null,
    serviceState: client.service_state as string | null,
    serviceZip: client.service_zip as string | null,
    turfSqft: client.turf_sqft as number | null,
    grossSqft: client.gross_sqft as number | null,
    mulchBedSqft: client.mulch_bed_sqft as number | null,
    yardsOfMulch: client.yards_of_mulch as number | null,
    linearFtPerimeter: client.linear_ft_perimeter as number | null,
    linearFtEdging: client.linear_ft_edging as number | null,
    gateLockCode: client.gate_lock_code as string | null,
    notesToCrew: client.notes_to_crew as string | null,
    salesRepName: rep ? `${rep.first_name} ${rep.last_name}`.trim() : null,
    referringClientName: referring?.display_name ?? (client.referred_by as string | null) ?? null,
  };
  const org = {
    name: (orgRow?.name as string | null) ?? null,
    timeZone,
    addressPhone: address?.phone ?? null,
    addressStreet: address?.street ?? null,
    addressCity: address?.city ?? null,
    addressState: address?.state ?? null,
    addressZip: address?.zip ?? null,
  };

  const html = buildClientMergeVars(mergeClient, org);
  const text = buildClientMergeVars(mergeClient, org, { escape: false });

  // The legacy single-phone column backs the phone tags for clients whose
  // typed `phones` array is empty.
  if (client.primary_phone) {
    for (const k of ["[clientcellphone]", "[clienthomephone]"]) {
      if (!text[k]) {
        text[k] = client.primary_phone;
        html[k] = params.escapeHtml(client.primary_phone);
      }
    }
  }
  for (const [k, v] of Object.entries(params.extras)) {
    text[k] = v;
    html[k] = params.escapeHtml(v);
  }
  return { html, text };
}
