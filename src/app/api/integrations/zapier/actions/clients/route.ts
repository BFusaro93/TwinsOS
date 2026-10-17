import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, authenticateZapierRequest, checkZapierRateLimit } from "@/lib/integrations/zapier";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";

const createClientSchema = z.object({
  displayName: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  accountType: z.enum(["residential", "commercial"]).optional(),
  source: z.string().optional(),
  serviceAddress: z.string().optional(),
  serviceCity: z.string().optional(),
  serviceState: z.string().optional(),
  serviceZip: z.string().optional(),
});

/**
 * POST /api/integrations/zapier/actions/clients — Zapier action ("Create
 * Client"). Mirrors the fields the CRM's own client-create form treats as
 * required (display_name) vs. optional.
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

  const parsed = createClientSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const body = parsed.data;

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
    console.error("[zapier action] create failed:", error?.message);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
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
  });
}
