import { NextResponse } from "next/server";
import { getRouteAuth, resolveCallerCrewId } from "@/lib/supabase/route-auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The crews a crew can call in to help on a stop: every active crew in its org
 * except its own. Names only — read under the service client because a crew
 * login's RLS doesn't list other crews; the org comes from the caller's own crew.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: me } = await (db as any)
    .from("crm_crews")
    .select("id, org_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!me) return NextResponse.json({ error: "Only a crew login can ask for help." }, { status: 403 });
  // Same crew resolution the visit routes use — keeps this list consistent with what the caller owns.
  const crewId = await resolveCallerCrewId(supabase, user.id, me.org_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("crm_crews")
    .select("id, name")
    .eq("org_id", me.org_id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .neq("id", crewId ?? me.id)
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ crews: (data ?? []) as { id: string; name: string }[] });
}
