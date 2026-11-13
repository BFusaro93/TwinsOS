import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/api/auth";
import { notifyPartStockShort } from "@/lib/part-shortfall-notify";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";

const bodySchema = z.object({
  woPartId: z.string().uuid(),
  shortBy: z.number().int().positive().max(1_000_000),
});

/** One alert per part per window — a WO saved twice shouldn't ping everyone twice. */
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

/**
 * POST /api/parts/shortfall-notify
 *
 * Fired best-effort from use-wo-costs after a WO part line clamped stock at 0.
 * The line must be visible to the caller in their own org, and the part must
 * actually be at (or below) zero on hand now — so the route can't be used to
 * page purchasers about arbitrary parts.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id, status").eq("id", user.id).single();
  // Staff impersonating an org act on that org, not their own (profiles.org_id).
  if (profile) profile.org_id = (await getEffectiveOrgId(supabase)) ?? profile.org_id;
  if (!profile?.org_id || profile.status === "inactive") {
    return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  }

  // Session client: the line has to be one this user can see.
  const { data: line } = await supabase
    .from("wo_parts")
    .select("org_id, part_id")
    .eq("id", parsed.data.woPartId)
    .maybeSingle();
  if (!line?.part_id || line.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = adminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: part } = await (db as any)
    .from("parts")
    .select("quantity_on_hand, is_inventory")
    .eq("id", line.part_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  // An untracked part (not an inventory item) is never short.
  if (!part || part.is_inventory === false || Number(part.quantity_on_hand) > 0) {
    return NextResponse.json({ success: true, skipped: "not_short" });
  }

  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const { count } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("org_id", profile.org_id)
    .eq("type", "part_stock_short")
    .eq("entity_id", line.part_id)
    .gte("created_at", since);
  if ((count ?? 0) > 0) return NextResponse.json({ success: true, skipped: "already_notified" });

  await notifyPartStockShort(db, { ...parsed.data, actorId: user.id });
  return NextResponse.json({ success: true });
}
