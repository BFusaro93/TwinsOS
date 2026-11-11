import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateZapierRequest, blankToUndefined, checkZapierRateLimit } from "@/lib/integrations/zapier";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { firstIssueMessage } from "@/lib/utils/zod-message";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { phoneDedupeKey } from "@/lib/utils/phone";
import { withIdempotency } from "@/lib/api/idempotency";
import { jsonServerError } from "@/lib/api/route-helpers";

// Every optional field goes through blankToUndefined: Zapier posts "" for an
// unmapped field, and `email: ""` used to fail as "Invalid email" — every
// phone-only form lead was rejected.
const createClientSchema = z.object({
  displayName: z.string().min(1),
  firstName: blankToUndefined(z.string()),
  lastName: blankToUndefined(z.string()),
  email: blankToUndefined(z.string().trim().email()),
  phone: blankToUndefined(z.string()),
  accountType: blankToUndefined(
    z
      .string()
      .transform((v) => v.trim().toLowerCase())
      .pipe(z.enum(["residential", "commercial"], { message: "accountType must be residential or commercial" }))
  ),
  source: blankToUndefined(z.string()),
  serviceAddress: blankToUndefined(z.string()),
  serviceCity: blankToUndefined(z.string()),
  serviceState: blankToUndefined(z.string()),
  serviceZip: blankToUndefined(z.string()),
});

type AdminDb = ReturnType<typeof adminClient>;

/** ILIKE with the wildcards escaped, i.e. a case-insensitive equality test. */
function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * The org's existing client for this email / phone, matched the way a web form
 * submission is (src/lib/forms/submit-form-response.ts): email first (contacts,
 * primary and billing email, case-insensitive), then phone on its last 10
 * digits. Only an unambiguous match counts — two candidates means "no match".
 */
async function findExistingClient(db: AdminDb, orgId: string, email?: string, phone?: string): Promise<string | null> {
  const unique = (ids: string[]) => {
    const set = [...new Set(ids)];
    return set.length === 1 ? set[0] : null;
  };
  if (email) {
    const pattern = escapeIlike(email.trim());
    const [{ data: contacts }, { data: primary }, { data: billing }] = await Promise.all([
      db.from("client_contacts").select("client_id, clients!inner(deleted_at)").eq("org_id", orgId)
        .ilike("email", pattern).is("deleted_at", null).is("clients.deleted_at", null).limit(2),
      db.from("clients").select("id").eq("org_id", orgId).is("deleted_at", null).ilike("primary_email", pattern).limit(2),
      db.from("clients").select("id").eq("org_id", orgId).is("deleted_at", null).ilike("billing_email", pattern).limit(2),
    ]);
    const byContact = unique((contacts ?? []).map((c: { client_id: string }) => c.client_id));
    if (byContact) return byContact;
    const byEmail = unique([...(primary ?? []), ...(billing ?? [])].map((c: { id: string }) => c.id));
    if (byEmail) return byEmail;
  }
  const digits = phoneDedupeKey(phone);
  if (digits) {
    const rows = await fetchAllRows<{ id: string; primary_phone: string | null }>(() =>
      db.from("clients").select("id, primary_phone").eq("org_id", orgId).is("deleted_at", null)
        .not("primary_phone", "is", null).order("id"),
    );
    return unique(rows.filter((r) => phoneDedupeKey(r.primary_phone) === digits).map((r) => r.id));
  }
  return null;
}

/**
 * POST /api/integrations/zapier/actions/clients — Zapier action ("Create
 * Client"). Mirrors the fields the CRM's own client-create form treats as
 * required (display_name) vs. optional.
 *
 * Find-or-create, like web forms: a Zap that fires twice for one lead (or a
 * returning customer filling in the same form) used to create a duplicate
 * client and enrol it in lead automations again. A matching client is returned
 * as-is (`existing: true`) — not modified, no timeline entry, no lead_created.
 */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateZapierRequest(request, db);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }
  if (!(await checkZapierRateLimit(db, auth.integrationId))) {
    return NextResponse.json({ error: "Rate limit exceeded — slow down" }, { status: 429 });
  }
  // Idempotency-Key: a retried create returns the first result instead of a duplicate.
  return withIdempotency(db, auth.orgId, request, async () => {
    const parsed = createClientSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssueMessage(parsed.error, "Invalid input") }, { status: 400 });
    }
    const body = parsed.data;

    const existingId = await findExistingClient(db, auth.orgId, body.email, body.phone);
    if (existingId) {
      const { data: existing } = await db
        .from("clients")
        .select("id, display_name, status, created_at")
        .eq("id", existingId)
        .eq("org_id", auth.orgId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({
          id: existing.id,
          displayName: existing.display_name,
          status: existing.status,
          createdAt: existing.created_at,
          existing: true,
        });
      }
    }

    const { data, error } = await db
      .from("clients")
      .insert({
        org_id: auth.orgId,
        display_name: body.displayName,
        first_name: body.firstName ?? null,
        last_name: body.lastName ?? null,
        primary_email: body.email ?? null,
        primary_phone: body.phone ?? null,
        account_type: body.accountType ?? "residential",
        source: body.source ?? "zapier",
        service_address: body.serviceAddress ?? null,
        service_city: body.serviceCity ?? null,
        service_state: body.serviceState ?? null,
        service_zip: body.serviceZip ?? null,
        status: "lead",
        // Leads carry no client_since — it's stamped when the lead converts.
      })
      .select("id, display_name, status, created_at")
      .single();

    if (error || !data) {
      // Don't hand raw database errors (constraint/column names) to the caller.
      return jsonServerError("zapier clients: create client failed", error);
    }

    // Same timeline entry + automation trigger as the v1 API's client create
    // and the in-app New Client dialog: without them a lead made through Zapier
    // left no activity and never enrolled in any lead_created automation.
    // Best-effort — the client already exists.
    await db.from("client_activity").insert({
      org_id: auth.orgId,
      client_id: data.id,
      activity_type: "note",
      subject: "Lead created",
    });
    try {
      await fireSimpleTrigger(db, { orgId: auth.orgId, clientId: data.id, triggerType: "lead_created" });
    } catch {
      // enrollment failure must not fail the create
    }

    return NextResponse.json({
      id: data.id,
      displayName: data.display_name,
      status: data.status,
      createdAt: data.created_at,
      existing: false,
    });
  });
}
