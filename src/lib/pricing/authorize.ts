import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A price run rewrites what customers get billed, so it is gated on its own
 * permission key rather than a general "edit" one — and enforced server-side
 * as well as in the UI, since the UI check only hides a button.
 */
export const PRICING_PERMISSION_KEY = "pricing_adjustment_run";

export async function authorizePricing(
  supabase: SupabaseClient
): Promise<NextResponse | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: PRICING_PERMISSION_KEY,
  });
  if (!data) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}
