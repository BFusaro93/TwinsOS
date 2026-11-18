import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route-auth";

/**
 * GET — services the office has opened up for crews to suggest from the field.
 * Native counterpart of useFieldUpsellServices(); both read the
 * crm_crew_upsell_services() definer RPC (name + pitch only — a crew login can't
 * read crm_services, whose rows carry rates and costs). An empty list is the
 * feature's on/off switch: the app hides "Suggest work" entirely. The upsell
 * POST re-checks the same list, so this only drives the UI. Scoped to the
 * caller's org by the RPC.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("crm_crew_upsell_services");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json(((data ?? []) as any[]).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    upsellPitch: (s.upsell_pitch as string | null) ?? null,
  })));
}
