import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
import { isClientStatus } from "@/lib/reports/client-status";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { CLIENT_SELECT, shapeClient } from "./shape";
import { createClientSchema } from "./validation";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";

/** GET /api/v1/clients — list the org's clients. Requires scope "clients:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "clients:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonServerError("GET /api/v1/clients", error);
  return NextResponse.json({ data: (data ?? []).map(shapeClient), limit, offset });
}

/** POST /api/v1/clients — creates a client. Requires scope "clients:write:safe". */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "clients:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createClientSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  // deleted_at IS NULL throughout: attaching a new client to a soft-deleted
  // parent, rep or referrer is a dangling reference nothing else resolves.
  if (body.parentClientId) {
    const { data: parent } = await db
      .from("clients")
      .select("org_id")
      .eq("id", body.parentClientId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!parent || parent.org_id !== auth.orgId) return jsonError("Parent client not found", 404);
  }
  if (body.salesRepId) {
    const { data: rep } = await db
      .from("crm_employees")
      .select("org_id")
      .eq("id", body.salesRepId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!rep || rep.org_id !== auth.orgId) return jsonError("Sales rep not found", 404);
  }
  if (body.referredByClientId) {
    const { data: ref } = await db
      .from("clients")
      .select("org_id")
      .eq("id", body.referredByClientId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!ref || ref.org_id !== auth.orgId) return jsonError("Referring client not found", 404);
  }

  const status = body.status ?? "lead";
  const { data, error } = await db
    .from("clients")
    .insert({
      org_id: auth.orgId,
      display_name: body.displayName,
      first_name: body.firstName ?? null,
      last_name: body.lastName ?? null,
      account_number: body.accountNumber ?? null,
      account_type: body.accountType ?? "residential",
      status,
      // client_since is the conversion date: set when the account is created
      // straight as a client, left NULL for leads until they convert.
      client_since: isClientStatus(status) ? todayInZone(await getOrgTimeZone(db, auth.orgId)) : null,
      primary_phone: body.primaryPhone ?? null,
      primary_email: body.primaryEmail ?? null,
      billing_address: body.billingAddress ?? null,
      billing_city: body.billingCity ?? null,
      billing_state: body.billingState ?? null,
      billing_zip: body.billingZip ?? null,
      billing_email: body.billingEmail ?? null,
      billing_same_as_service: body.billingSameAsService ?? true,
      service_address: body.serviceAddress ?? null,
      service_city: body.serviceCity ?? null,
      service_state: body.serviceState ?? null,
      service_zip: body.serviceZip ?? null,
      source: body.source ?? null,
      parent_client_id: body.parentClientId ?? null,
      sales_rep_id: body.salesRepId ?? null,
      referred_by: body.referredBy ?? null,
      referred_by_client_id: body.referredByClientId ?? null,
      ok_to_email: body.okToEmail ?? true,
      do_not_market: body.doNotMarket ?? false,
      sms_opt_in: body.smsOptIn ?? false,
      // An SMS opt-in is only defensible under the approved A2P 10DLC
      // campaign with a record of when consent was given and how it was
      // collected. Every other path that sets sms_opt_in stamps both (the
      // Twilio keyword webhook, form submission, useUpdateClient's manual
      // toggle); this one recorded the flag alone, leaving an opt-in with no
      // provenance. Source defaults to "manual" — a third party asserting
      // consent through the API is the same situation as staff entering it.
      sms_opt_in_at: body.smsOptIn ? new Date().toISOString() : null,
      sms_opt_in_source: body.smsOptIn ? (body.smsOptInSource ?? "manual") : null,
      payment_method: body.paymentMethod ?? null,
      billing_terms: body.billingTerms ?? null,
      invoice_frequency: body.invoiceFrequency ?? null,
      invoice_delivery: body.invoiceDelivery ?? null,
      default_tax_rate_bps: body.defaultTaxRateBps ?? 0,
      default_terms: body.defaultTerms ?? null,
      default_payment_method: body.defaultPaymentMethod ?? null,
      is_taxable: body.isTaxable ?? true,
      gate_lock_code: body.gateCode ?? null,
      notes_to_crew: body.notesToCrew ?? null,
      map_code: body.mapCode ?? null,
      office_notes: body.officeNotes ?? null,
      priority: body.priority ?? null,
      turf_sqft: body.turfSqft ?? null,
      mulch_bed_sqft: body.mulchBedSqft ?? null,
      gross_sqft: body.grossSqft ?? null,
      linear_ft_perimeter: body.linearFtPerimeter ?? null,
      linear_ft_edging: body.linearFtEdging ?? null,
      yards_of_mulch: body.yardsOfMulch ?? null,
    })
    .select(CLIENT_SELECT)
    .single();

  if (error || !data) return jsonServerError("POST /api/v1/clients", error);

  // Same client-activity entry + automation trigger the app's own New
  // Client dialog fires (useCreateClient, src/lib/hooks/use-clients.ts) —
  // without these, a client created via the API leaves no activity-log
  // entry and never enrolls in any lead_created/client_created automation.
  await db.from("client_activity").insert({
    org_id: auth.orgId,
    client_id: data.id,
    activity_type: "note",
    subject: status === "lead" ? "Lead created" : "Client created",
  });
  await fireSimpleTrigger(db, {
    orgId: auth.orgId,
    clientId: data.id,
    triggerType: status === "lead" ? "lead_created" : "client_created",
  });

  return NextResponse.json(shapeClient(data), { status: 201 });
}
