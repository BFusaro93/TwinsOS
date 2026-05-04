/**
 * POST /api/public/work-requests
 *
 * Public webhook endpoint — no user auth required.
 * Accepts a JSON body from Microsoft Forms (via Power Automate) or any
 * HTTP client and creates a Maintenance Request in the org identified by
 * `orgSlug`.
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
 *   "equipment":     "Truck #4",                // optional — asset name
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

const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

function normalisePriority(raw: unknown): string {
  if (typeof raw !== "string") return "medium";
  const s = raw.trim().toLowerCase();
  return VALID_PRIORITIES.has(s) ? s : "medium";
}

function normaliseRepairTag(raw: unknown): boolean | null {
  if (raw === true || raw === "yes" || raw === "true") return true;
  if (raw === false || raw === "no" || raw === "false") return false;
  return null;
}

export async function POST(req: NextRequest) {
  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgSlug      = (body.orgSlug      as string | undefined)?.trim();
  const requestedBy  = (body.requestedBy  as string | undefined)?.trim();
  const title        = (body.title        as string | undefined)?.trim();

  if (!orgSlug)     return NextResponse.json({ error: "orgSlug is required" },     { status: 400 });
  if (!requestedBy) return NextResponse.json({ error: "requestedBy is required" }, { status: 400 });
  if (!title)       return NextResponse.json({ error: "title is required" },       { status: 400 });

  // ── Service-role client (bypasses RLS — safe for server-side only) ────────
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // ── Resolve org & check portal_enabled ────────────────────────────────────
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

  // ── Build request number ──────────────────────────────────────────────────
  const requestNumber = `MR-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;

  // ── Insert ────────────────────────────────────────────────────────────────
  const { data: mr, error: insertErr } = await supabase
    .from("maintenance_requests")
    .insert({
      org_id:             org.id,
      request_number:     requestNumber,
      title,
      description:        (body.description  as string | undefined)?.trim() || null,
      status:             "open",
      priority:           normalisePriority(body.priority),
      asset_name:         (body.equipment    as string | undefined)?.trim() || null,
      requested_by_name:  requestedBy,
      equipment_type:     (body.equipmentType  as string | undefined)?.trim() || null,
      repair_category:    (body.repairCategory as string | undefined)?.trim() || null,
      has_repair_tag:     normaliseRepairTag(body.hasRepairTag),
      linked_work_order_id:     null,
      linked_work_order_number: null,
    })
    .select("id, request_number")
    .single();

  if (insertErr) {
    console.error("[public/work-requests] insert error:", insertErr);
    return NextResponse.json({ error: "Failed to create request" }, { status: 500 });
  }

  // Notify admins/managers (best-effort)
  fetch(`${req.nextUrl.origin}/api/notifications/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "new_maintenance_request",
      entityId: mr.id,
      entityType: "maintenance_request",
    }),
  }).catch(() => {});

  return NextResponse.json(
    { requestNumber: mr.request_number, id: mr.id },
    { status: 201 }
  );
}
