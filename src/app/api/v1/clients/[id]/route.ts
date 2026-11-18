import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { isUuid } from "../../id-param";
import { clientNotFoundResponse, jsonError, jsonServerError } from "@/lib/api/route-helpers";
import { fireServerTrigger } from "@/lib/automations/fire-server-trigger";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { CLIENT_SELECT, shapeClient } from "../shape";
import { updateClientSchema } from "../validation";
import { firstIssueMessage } from "@/lib/utils/zod-message";

/** GET /api/v1/clients/[id] — fetch one client. Requires scope "clients:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "clients:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  // A non-uuid id reached Postgres as a cast error and came back a 500.
  if (!isUuid(id)) return jsonError("Client not found", 404);

  const { data, error } = await db
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonServerError("GET /api/v1/clients/[id]", error);
  if (!data) return clientNotFoundResponse(db, auth.orgId, id);
  return NextResponse.json(shapeClient(data));
}

/** PATCH /api/v1/clients/[id] — updates a client. Requires scope "clients:write:safe". */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "clients:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  // A non-uuid id reached Postgres as a cast error and came back a 500.
  if (!isUuid(id)) return jsonError("Client not found", 404);

  const parsed = updateClientSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(firstIssueMessage(parsed.error, "Invalid input"), 400);
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
  //
  // Also reads the current address so an address edit can drop the stale
  // geocode (useUpdateClient's addressStale): lat/lng and the verdict
  // otherwise kept pointing the dispatch map and waiting-list geo at the OLD
  // location.
  const ADDRESS_KEYS = [
    ["billingAddress", "billing_address"], ["billingCity", "billing_city"],
    ["billingState", "billing_state"], ["billingZip", "billing_zip"],
    ["serviceAddress", "service_address"], ["serviceCity", "service_city"],
    ["serviceState", "service_state"], ["serviceZip", "service_zip"],
  ] as const;
  const addressTouched = ADDRESS_KEYS.some(([k]) => body[k] !== undefined);
  let previousStatus: string | null = null;
  let previousSmsOptIn = false;
  let previousSource: string | null = null;
  let previousReferrerId: string | null = null;
  let previousDoNotMarket = false;
  let phoneChanged = false;
  let addressStale = false;
  if (
    body.status !== undefined || body.smsOptIn !== undefined || body.primaryPhone !== undefined || addressTouched ||
    body.source !== undefined || body.referredByClientId !== undefined || body.doNotMarket !== undefined
  ) {
    const { data: current } = await db
      .from("clients")
      .select(
        "status, sms_opt_in, source, referred_by_client_id, do_not_market, primary_phone, billing_address, billing_city, billing_state, billing_zip, service_address, service_city, service_state, service_zip"
      )
      .eq("org_id", auth.orgId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!current) return clientNotFoundResponse(db, auth.orgId, id);
    previousStatus = current.status as string;
    previousSmsOptIn = (current.sms_opt_in as boolean | null) ?? false;
    previousSource = (current.source as string | null) || null;
    previousReferrerId = (current.referred_by_client_id as string | null) ?? null;
    previousDoNotMarket = (current.do_not_market as boolean | null) === true;
    const lastDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);
    phoneChanged = body.primaryPhone !== undefined && lastDigits(body.primaryPhone) !== lastDigits(current.primary_phone);
    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
    addressStale = ADDRESS_KEYS.some(([k, col]) => body[k] !== undefined && norm(body[k]) !== norm(current[col]));
  }
  const statusChanged = body.status !== undefined && previousStatus !== null && previousStatus !== body.status;
  // 'lost' closes a LEAD (useCloseLeadAsLost); a client who was ever active
  // is cancelled instead — the lost-leads and cancellation reports depend on
  // the distinction.
  if (statusChanged && body.status === "lost" && previousStatus !== "lead") {
    return jsonError("Only a lead can be closed as lost — use status 'cancelled' for a client", 400);
  }
  const smsOptInJustEnabled = body.smsOptIn === true && !previousSmsOptIn;
  // "" and null are both "no source", as in useUpdateClient.
  const sourceChanged = body.source !== undefined && (body.source || null) !== previousSource;
  // A referrer newly set (or changed) — not a re-send of the same one, not a clear.
  const newReferrerId = body.referredByClientId && body.referredByClientId !== previousReferrerId ? body.referredByClientId : null;
  // Whether this account was never a client (no client_since, job or invoice) — the same
  // crm_clients_never_converted rule the app and the bulk route use, read BEFORE the update
  // (a conversion stamps client_since). Moving such an account to Active is a lead
  // CONVERSION, whatever its status says (a lead once set Inactive still converts);
  // closing it is a lead cancellation, not a client cancellation.
  let neverConverted = false;
  if (statusChanged && (body.status === "active" || body.status === "cancelled" || body.status === "lost")) {
    const { data: neverIds, error: neverErr } = await db.rpc("crm_clients_never_converted", { p_client_ids: [id] });
    if (neverErr) return jsonServerError("PATCH /api/v1/clients/[id]", neverErr);
    neverConverted = ((neverIds ?? []) as string[]).includes(id);
  }
  // A conversion stamps client_since (the conversion date) exactly as useUpdateClient /
  // useActivateClient do, since reports key off it.
  const convertingLead = statusChanged && body.status === "active" && neverConverted;
  const clientSince = convertingLead
    ? todayInZone(await getOrgTimeZone(db, auth.orgId))
    : null;
  // Closing stamps closed_at (useCancelClient / useCloseLeadAsLost) — the
  // cancelled-clients and lost-leads reports key on it. Reopening clears the
  // closure, as useUpdateClient / useActivateClient do.
  const closing = statusChanged && (body.status === "cancelled" || body.status === "lost");
  const reopening =
    statusChanged &&
    (previousStatus === "cancelled" || previousStatus === "lost") &&
    (body.status === "active" || body.status === "lead");

  const { data, error } = await db
    .from("clients")
    .update({
      ...(body.displayName !== undefined && { display_name: body.displayName }),
      ...(body.firstName !== undefined && { first_name: body.firstName }),
      ...(body.lastName !== undefined && { last_name: body.lastName }),
      ...(body.accountNumber !== undefined && { account_number: body.accountNumber }),
      ...(body.accountType !== undefined && { account_type: body.accountType }),
      ...(body.status !== undefined && { status: body.status }),
      ...(clientSince && { client_since: clientSince }),
      ...(closing && { closed_at: new Date().toISOString() }),
      ...(reopening && { cancellation_reason: null, closed_at: null }),
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
      ...(addressStale && { address_verdict: null, address_verified_at: null, lat: null, lng: null }),
      ...(body.source !== undefined && { source: body.source }),
      ...(body.salesRepId !== undefined && { sales_rep_id: body.salesRepId }),
      ...(body.referredBy !== undefined && { referred_by: body.referredBy }),
      ...(body.referredByClientId !== undefined && { referred_by_client_id: body.referredByClientId }),
      ...(body.okToEmail !== undefined && { ok_to_email: body.okToEmail }),
      ...(body.doNotMarket !== undefined && { do_not_market: body.doNotMarket }),
      // Consent was given for the previous number, not a new one, unless the caller sets it explicitly.
      // The old consent stamp goes with it (useUpdateClient does the same).
      ...(phoneChanged && body.smsOptIn === undefined && { sms_opt_in: false, sms_opt_in_at: null, sms_opt_in_source: null }),
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
  if (!data) return clientNotFoundResponse(db, auth.orgId, id);

  if (phoneChanged && previousSmsOptIn && body.smsOptIn === undefined) {
    await db.from("client_activity").insert({
      org_id: auth.orgId,
      client_id: id,
      activity_type: "note",
      subject: "Text consent cleared: primary phone number changed",
    });
  }

  if (statusChanged) {
    await db.from("client_activity").insert({
      org_id: auth.orgId,
      client_id: id,
      activity_type: "note",
      subject: `Status changed: ${previousStatus} → ${body.status}`,
    });

    // Same status-transition triggers the app fires (useUpdateClient / useActivateClient /
    // useCancelClient / the bulk route): to Active = conversion for a never-converted
    // account, else reactivation; closing a never-converted account (or a lead / lost lead)
    // = lead_cancelled, else cancelling = client_cancelled.
    const closingLead = closing && (neverConverted || previousStatus === "lead" || previousStatus === "lost");
    if (closingLead) {
      await fireServerTrigger(db, { orgId: auth.orgId, clientId: id, triggerType: "lead_cancelled" });
    } else if (convertingLead) {
      await fireServerTrigger(db, { orgId: auth.orgId, clientId: id, triggerType: "lead_converted_to_client" });
    } else if (body.status === "cancelled") {
      await fireServerTrigger(db, { orgId: auth.orgId, clientId: id, triggerType: "client_cancelled" });
    } else if (body.status === "active") {
      await fireServerTrigger(db, { orgId: auth.orgId, clientId: id, triggerType: "client_reactivated" });
    }
  }

  // The same field-change triggers useUpdateClient fires. org and client ids are the
  // API key's org and a row this update just matched in it; the referrer was verified above.
  if (sourceChanged) {
    const newSource = body.source || null;
    await fireServerTrigger(db, {
      orgId: auth.orgId,
      clientId: id,
      triggerType: "client_source_updated",
      matchValues: newSource ? [newSource] : undefined,
    });
  }
  if (smsOptInJustEnabled) {
    await fireServerTrigger(db, { orgId: auth.orgId, clientId: id, triggerType: "has_opted_in_sms" });
  }
  // "Re-subscribed to emails" (key has_opted_in_emails): Do Not Market turned off.
  if (body.doNotMarket === false && previousDoNotMarket) {
    await fireServerTrigger(db, { orgId: auth.orgId, clientId: id, triggerType: "has_opted_in_emails" });
  }
  if (newReferrerId) {
    // For the REFERRER's record, as in the app — the sequence thanks whoever made the referral.
    await fireServerTrigger(db, { orgId: auth.orgId, clientId: newReferrerId, triggerType: "client_referred" });
  }

  return NextResponse.json(shapeClient(data));
}
