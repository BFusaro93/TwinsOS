import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { adminClient, generateZapierApiKey } from "@/lib/integrations/zapier";

/**
 * POST /api/integrations/zapier — (re)generates the org's Zapier API key.
 * Session-authenticated, admin-only. Returns the plaintext key once; after
 * this it's only readable via the masked integrations row (RLS-scoped,
 * read directly by the Settings UI via use-integrations.ts).
 */
export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const apiKey = generateZapierApiKey();
  const db = adminClient();

  const { error } = await db
    .from("integrations")
    .upsert(
      { org_id: profile.org_id, provider: "zapier", api_key: apiKey, enabled: true },
      { onConflict: "org_id,provider" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ apiKey });
}
