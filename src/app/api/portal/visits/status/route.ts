import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPortalAccounts, getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";

// Live status for the visits a portal page is showing. Replaces the Realtime
// subscription on crm_job_visits: portal users have no RLS read path to that
// table (Realtime payloads carried every internal column — crew notes, labor
// cost, skip reasons), so the portal polls this instead. Service client,
// scoped to this login's accounts + org; returns id and status only.

const MAX_IDS = 50;
const IdsSchema = z.array(z.string().uuid()).min(1).max(MAX_IDS);

export async function GET(req: NextRequest) {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const parsed = IdsSchema.safeParse([...new Set(raw)]);
  if (!parsed.success) return NextResponse.json({ error: "Invalid visit ids" }, { status: 400 });

  const accountIds = new Set((await getPortalAccounts(ctx)).map((a) => a.id));
  const { data, error } = await createServiceClient()
    .from("crm_job_visits")
    .select("id, client_id, status")
    .in("id", parsed.data)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null);
  if (error) return NextResponse.json({ error: "Failed to load visits" }, { status: 500 });

  // Ownership checked in code (a property manager's sub-account list is too
  // long for an .in() filter in the URL).
  const visits = (data ?? [])
    .filter((v) => v.client_id && accountIds.has(v.client_id))
    .map((v) => ({ id: v.id, status: v.status }));
  return NextResponse.json({ visits }, { headers: { "Cache-Control": "private, no-store" } });
}
