/**
 * POST /api/public/work-requests
 *
 * Public webhook endpoint — no user auth required.
 * Accepts a JSON body from Microsoft Forms (via Power Automate), the public
 * /request/[slug] portal page, or any HTTP client, and creates a Maintenance
 * Request in the org identified by `orgSlug`.
 *
 * Power Automate setup:
 *   Trigger : "When a new response is submitted" (Microsoft Forms)
 *   Action  : "HTTP" → POST this URL with the body below
 *   Headers : "x-webhook-secret" → WORK_REQUESTS_WEBHOOK_SECRET (see below) —
 *             lets this specific flow skip Turnstile, which a server-to-server
 *             webhook could never solve.
 *
 * Request body (all strings unless noted):
 * {
 *   "orgSlug":        "your-org-slug",          // required — identifies the org
 *   "requestedBy":   "Jane Smith",              // required — crew / submitter name
 *   "title":         "Truck #4 — won't start",  // required — short summary
 *   "description":   "Won't turn over…",        // optional
 *   "equipment":     "Truck #4",                // optional — asset name (freeform)
 *   "assetId":       "uuid",                    // optional — set when `equipment` matched a real asset/vehicle
 *   "equipmentType": "Vehicle",                 // optional
 *   "repairCategory":"Engine",                  // optional
 *   "hasRepairTag":  true,                      // optional — boolean or "yes"/"no"
 *   "priority":      "high",                    // optional — low|medium|high|critical
 *   "turnstileToken":"..."                      // required only when TURNSTILE_SECRET_KEY is set
 *                                                // and the request isn't the trusted webhook above
 * }
 *
 * Response 201: { requestNumber, id }
 * Response 400: { error: "..." }
 * Response 404: { error: "Org not found or portal disabled" }
 */

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { submitWorkRequest } from "@/lib/field/submit-work-request";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { checkAuthRateLimit, getClientIp } from "@/lib/auth/rate-limit";
import { z } from "zod";

// Length caps on every free-text field — this endpoint is public.
const optionalText = (max: number) => z.string().max(max).optional();
const BodySchema = z.object({
  orgSlug: z.string().trim().min(1).max(100),
  requestedBy: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  description: optionalText(5000),
  priority: optionalText(20),
  equipment: optionalText(200),
  assetId: z.string().uuid().optional(),
  equipmentType: optionalText(100),
  repairCategory: optionalText(100),
});

// Twins' own operating org — see src/lib/hooks/use-internal-org.ts. The
// webhook-secret Turnstile bypass below is scoped to this org only, so a
// leaked secret can't be used to flood every tenant's portal, just this one.
const TWINS_LAWN_SERVICE_ORG_ID = "619de9bb-f8f8-46cf-983c-9faf54f6a7d0";

function isTrustedWebhook(req: NextRequest, orgId: string): boolean {
  const expected = process.env.WORK_REQUESTS_WEBHOOK_SECRET;
  if (!expected || orgId !== TWINS_LAWN_SERVICE_ORG_ID) return false;

  const provided = req.headers.get("x-webhook-secret");
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // Drop null/empty optionals so they don't fail the type checks below.
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== null && v !== "") cleaned[k] = v;
  }
  const parsed = BodySchema.safeParse(cleaned);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const missing = parsed.error.issues[0]?.code === "invalid_type" && cleaned[String(field)] === undefined;
    return NextResponse.json(
      { error: missing ? `${String(field)} is required` : `Invalid or too long: ${String(field ?? "body")}` },
      { status: 400 }
    );
  }
  const { orgSlug, requestedBy, title } = parsed.data;

  // Service-role client (bypasses RLS — safe for server-side only)
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, portal_enabled")
    .eq("slug", orgSlug)
    .single();

  if (orgErr || !org) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }
  if (!org.portal_enabled) {
    return NextResponse.json(
      { error: "Maintenance request portal is not enabled for this organisation" },
      { status: 403 }
    );
  }

  // Opt-in Turnstile gate (see verifyTurnstileToken) — no-ops when
  // TURNSTILE_SECRET_KEY is unset. The Twins internal Power Automate flow
  // (Microsoft Forms → this webhook) can't solve a browser challenge, so it
  // authenticates instead with a shared secret header — see isTrustedWebhook.
  if (!isTrustedWebhook(req, org.id)) {
    // Per-IP-per-org throttle: Turnstile is opt-in, so without this an
    // unauthenticated caller could flood an org's request queue and the
    // admin notification emails.
    const allowed = await checkAuthRateLimit(`workreq:${orgSlug}:${getClientIp(req)}`, 10, 600);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }
    const forwardedFor = req.headers.get("x-forwarded-for");
    const turnstileResult = await verifyTurnstileToken(
      body.turnstileToken as string | undefined,
      forwardedFor?.split(",")[0]?.trim()
    );
    if (!turnstileResult.ok) {
      return NextResponse.json({ error: turnstileResult.error }, { status: 400 });
    }
  }

  try {
    const result = await submitWorkRequest(
      supabase,
      { id: org.id },
      {
        requestedBy,
        title,
        description: parsed.data.description,
        priority: parsed.data.priority,
        equipment: parsed.data.equipment,
        assetId: parsed.data.assetId,
        equipmentType: parsed.data.equipmentType,
        repairCategory: parsed.data.repairCategory,
        hasRepairTag: body.hasRepairTag,
      },
      { createdBy: null, requestedById: null }
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[public/work-requests] error:", err);
    return NextResponse.json({ error: "Failed to create request" }, { status: 500 });
  }
}
