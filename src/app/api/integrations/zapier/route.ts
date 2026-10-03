import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { adminClient, generateZapierApiKey } from "@/lib/integrations/zapier";

/**
 * POST /api/integrations/zapier — (re)generates the org's Zapier API key.
 * Session-authenticated, admin-only. Returns the plaintext key once; only the SHA-256 hash
 * and a display prefix are stored, so it can never be shown again.
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

  const { key: apiKey, keyHash, keyPrefix } = generateZapierApiKey();
  const db = adminClient();

  const { error } = await db
    .from("integrations")
    .upsert(
      { org_id: profile.org_id, provider: "zapier", api_key: null, api_key_hash: keyHash, api_key_prefix: keyPrefix, enabled: true },
      { onConflict: "org_id,provider" }
    );

  if (error) {
    logger.child("zapier-key").error("key upsert failed", { error: error.message });
    return NextResponse.json({ error: "Failed to generate key" }, { status: 500 });
  }

  return NextResponse.json({ apiKey });
}
