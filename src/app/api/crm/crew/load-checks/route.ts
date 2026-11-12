import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { resolveCallerCrewId } from "@/lib/supabase/crew-id";
import { createServiceClient } from "@/lib/supabase/server";
import { getCrewEquipment, getCrewMaterials } from "@/lib/crew/crew-load";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

const BodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  key: z.string().regex(/^(vehicle|asset|product):[0-9a-fA-F-]{36}$/),
  loaded: z.boolean(),
});

/**
 * POST /api/crm/crew/load-checks  { date, key, loaded }
 *
 * The crew ticks an equipment item or a material as loaded (or un-ticks it). The key must be
 * on the caller's own crew's list for that day — the same lists the GET routes return — so a
 * crew login can't write a check for someone else's truck. Un-ticking deletes the row; a new
 * day starts empty, which is the daily reset.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { date, key, loaded } = parsed.data;

  const db = supabase as AnyDb;
  const { data: profile } = await db.from("profiles").select("org_id").eq("id", user.id).single();
  const orgId = profile?.org_id as string | undefined;
  if (!orgId) return NextResponse.json({ error: "No organization for this user" }, { status: 403 });

  const crewId = await resolveCallerCrewId(supabase, user.id, orgId);
  if (!crewId) return NextResponse.json({ error: "Not on a crew" }, { status: 403 });

  const admin = createServiceClient() as AnyDb;
  try {
    const onList = key.startsWith("product:")
      ? (await getCrewMaterials(db, admin, orgId, crewId, date)).some((m) => m.key === key)
      : (await getCrewEquipment(admin, orgId, crewId, date)).some((e) => e.key === key);
    // Un-ticking is always allowed (the office may have moved the item off the crew since).
    if (loaded && !onList) return NextResponse.json({ error: "That item isn't on your crew's list today" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Could not verify the item" }, { status: 500 });
  }

  if (loaded) {
    const { error } = await admin.from("crm_crew_load_checks").upsert(
      { org_id: orgId, crew_id: crewId, work_date: date, item_key: key, loaded_by: user.id, created_by: user.id, loaded_at: new Date().toISOString() },
      { onConflict: "org_id,crew_id,work_date,item_key" }
    );
    if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  } else {
    const { error } = await admin
      .from("crm_crew_load_checks")
      .delete()
      .eq("org_id", orgId).eq("crew_id", crewId).eq("work_date", date).eq("item_key", key);
    if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
  return NextResponse.json({ key, loaded });
}
