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
 *   "priority":      "high"                     // optional — low|medium|high|critical
 * }
 *
 * Response 201: { requestNumber, id }
 * Response 400: { error: "..." }
 * Response 404: { error: "Org not found or portal disabled" }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { submitWorkRequest } from "@/lib/field/submit-work-request";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgSlug     = (body.orgSlug     as string | undefined)?.trim();
  const requestedBy = (body.requestedBy as string | undefined)?.trim();
  const title       = (body.title       as string | undefined)?.trim();

  if (!orgSlug)     return NextResponse.json({ error: "orgSlug is required" },     { status: 400 });
  if (!requestedBy) return NextResponse.json({ error: "requestedBy is required" }, { status: 400 });
  if (!title)       return NextResponse.json({ error: "title is required" },       { status: 400 });

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

  try {
    const result = await submitWorkRequest(
      supabase,
      { id: org.id },
      {
        requestedBy,
        title,
        description: body.description as string | undefined,
        priority: body.priority as string | undefined,
        equipment: body.equipment as string | undefined,
        assetId: body.assetId as string | undefined,
        equipmentType: body.equipmentType as string | undefined,
        repairCategory: body.repairCategory as string | undefined,
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
