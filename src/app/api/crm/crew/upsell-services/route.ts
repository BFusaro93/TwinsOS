import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route-auth";

/**
 * GET — services the office has opened up for crews to suggest from the field.
 * Native counterpart of useFieldUpsellServices() (the web hook reads crm_services
 * through the browser client). An empty list is the feature's on/off switch: the
 * app hides "Suggest work" entirely. The upsell POST re-checks
 * show_in_field_upsells, so this only drives the UI. Scoped by the caller's own
 * RLS, same as the web hook.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_services")
    .select("id, name, upsell_pitch")
    .eq("show_in_field_upsells", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json(((data ?? []) as any[]).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    upsellPitch: (s.upsell_pitch as string | null) ?? null,
  })));
}
