import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError } from "@/lib/api/route-helpers";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { CLIENT_SELECT, shapeClient } from "../shape";
import { updateClientSchema } from "../validation";

/** GET /api/v1/clients/[id] — fetch one client. Requires scope "clients:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "clients:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { data, error } = await db
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonServerError("GET /api/v1/clients/[id]", error);
  if (!data) return jsonError("Client not found", 404);
  return NextResponse.json(shapeClient(data));
}

/** PATCH /api/v1/clients/[id] — updates a client. Requires scope "clients:write:safe". */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "clients:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = updateClientSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  if (Object.keys(body).length === 0) return jsonError("No fields to update", 400);

  // Truthy, not `!== undefined`: an explicit null clears the link and has
  // nothing to look up (these fields are nullable so they can be cleared at
  // all). deleted_at IS NULL so a soft-deleted rep/client can't be attached.
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

  // Read the current status before updating, so a status change can be
  // logged and the right automation trigger fired — same as useUpdateClient
  // (src/lib/hooks/use-clients.ts).
  // Also reads the current sms_opt_in so a false -> true transition can be
  // stamped with a consent timestamp and source, the same way
  // useUpdateClient does (smsOptInJustEnabled). Re-sending smsOptIn: true on
  // an already-opted-in client must NOT refresh the timestamp — that would
  // overwrite the real consent date with today's.
  let previousStatus: string | null = null;
  let previousSmsOptIn = false;
  if (body.status !== undefined || body.smsOptIn !== undefined) {
    const { data: current } = await db
      .from("clients")
      .select("status, sms_opt_in")
      .eq("org_id", auth.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!current) return jsonError("Client not found", 404);
    previousStatus = current.status as string;
    previousSmsOptIn = (current.sms_opt_in as boolean | null) ?? false;
  }
  const smsOptInJustEnabled = body.smsOptIn === true && !previousSmsOptIn;

  const { data, error } = await db
    .from("clients")
    .update({
      ...(body.displayName !== undefined && { display_name: body.displayName }),
      ...(body.firstName !== undefined && { first_name: body.firstName }),
      ...(body.lastName !== undefined && { last_name: body.lastName }),
      ...(body.accountNumber !== undefined && { account_number: body.accountNumber }),
      ...(body.accountType !== undefined && { account_type: body.accountType }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.primaryPhone !== undefined && { primary_phone: body.primaryPhone }),
      ...(body.primaryEmail !== undefined && { primary_email: body.primaryEmail }),
      ...(body.billingAddress !== undefined && { billing_address: body.billingAddress }),
      ...(body.billingCity !== undefined && { billing_city: body.billingCity }),
      ...(body.billingState !== undefined && { billing_state: body.billingState }),
      ...(body.billingZip !== undefined && { billing_zip: body.billingZip }),
      ...(body.billingEmail !== undefined && { billing_email: body.billingEmail }),
      ...(body.billingSameAsService !== undefined && { billing_same_as_service: body.billingSameAsService }),
      ...(body.serviceAddress !== undefined && { service_address: body.serviceAddress }),
      ...(body.serviceCity !== undefined && { service_city: body.serviceCity }),
      ...(body.serviceState !== undefined && { service_state: body.serviceState }),
      ...(body.serviceZip !== undefined && { service_zip: body.serviceZip }),
      ...(body.source !== undefined && { source: body.source }),
      ...(body.salesRepId !== undefined && { sales_rep_id: body.salesRepId }),
      ...(body.referredBy !== undefined && { referred_by: body.referredBy }),
      ...(body.referredByClientId !== undefined && { referred_by_client_id: body.referredByClientId }),
      ...(body.okToEmail !== undefined && { ok_to_email: body.okToEmail }),
      ...(body.doNotMarket !== undefined && { do_not_market: body.doNotMarket }),
      ...(body.smsOptIn !== undefined && { sms_opt_in: body.smsOptIn }),
      ...(smsOptInJustEnabled && {
        sms_opt_in_at: new Date().toISOString(),
        sms_opt_in_source: body.smsOptInSource ?? "manual",
      }),
      ...(body.paymentMethod !== undefined && { payment_method: body.paymentMethod }),
      ...(body.billingTerms !== undefined && { billing_terms: body.billingTerms }),
      ...(body.invoiceFrequency !== undefined && { invoice_frequency: body.invoiceFrequency }),
      ...(body.invoiceDelivery !== undefined && { invoice_delivery: body.invoiceDelivery }),
      ...(body.defaultTaxRateBps !== undefined && { default_tax_rate_bps: body.defaultTaxRateBps }),
      ...(body.defaultTerms !== undefined && { default_terms: body.defaultTerms }),
      ...(body.defaultPaymentMethod !== undefined && { default_payment_method: body.defaultPaymentMethod }),
      ...(body.isTaxable !== undefined && { is_taxable: body.isTaxable }),
      ...(body.gateCode !== undefined && { gate_lock_code: body.gateCode }),
      ...(body.notesToCrew !== undefined && { notes_to_crew: body.notesToCrew }),
      ...(body.mapCode !== undefined && { map_code: body.mapCode }),
      ...(body.officeNotes !== undefined && { office_notes: body.officeNotes }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.turfSqft !== undefined && { turf_sqft: body.turfSqft }),
      ...(body.mulchBedSqft !== undefined && { mulch_bed_sqft: body.mulchBedSqft }),
      ...(body.grossSqft !== undefined && { gross_sqft: body.grossSqft }),
      ...(body.linearFtPerimeter !== undefined && { linear_ft_perimeter: body.linearFtPerimeter }),
      ...(body.linearFtEdging !== undefined && { linear_ft_edging: body.linearFtEdging }),
      ...(body.yardsOfMulch !== undefined && { yards_of_mulch: body.yardsOfMulch }),
    })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .select(CLIENT_SELECT)
    .maybeSingle();

  if (error) return jsonServerError("PATCH /api/v1/clients/[id]", error);
  if (!data) return jsonError("Client not found", 404);

  if (body.status !== undefined && previousStatus !== null && previousStatus !== body.status) {
    await db.from("client_activity").insert({
      org_id: auth.orgId,
      client_id: id,
      activity_type: "note",
      subject: `Status changed: ${previousStatus} → ${body.status}`,
    });

    // Same status-transition triggers useUpdateClient fires. Narrower than
    // the app (skips tag/opt-in-specific triggers, which aren't tied to a
    // status change) but covers the meaningful lifecycle transitions.
    if (previousStatus === "lead" && body.status !== "lead") {
      await fireSimpleTrigger(db, { orgId: auth.orgId, clientId: id, triggerType: "lead_converted_to_client" });
    } else if (body.status === "cancelled") {
      await fireSimpleTrigger(db, {
        orgId: auth.orgId,
        clientId: id,
        triggerType: previousStatus === "lead" ? "lead_cancelled" : "client_cancelled",
      });
    } else if ((previousStatus === "inactive" || previousStatus === "cancelled") && body.status === "active") {
      await fireSimpleTrigger(db, { orgId: auth.orgId, clientId: id, triggerType: "client_reactivated" });
    }
  }

  return NextResponse.json(shapeClient(data));
}
