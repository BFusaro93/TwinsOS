import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/api/auth";
import { isKnownScope } from "@/lib/api/scopes";

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).min(1),
});

/** GET /api/settings/api-keys — list the org's API keys (never returns key_hash or the plaintext key). */
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, scopes, rate_limit_per_min, last_used_at, revoked_at, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ keys: data });
}

/** POST /api/settings/api-keys — creates a new scoped API key. Admin-only; returns the plaintext key once. */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const parsed = createKeySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { name, scopes } = parsed.data;

  const unknownScope = scopes.find((scope) => !isKnownScope(scope));
  if (unknownScope) {
    return NextResponse.json({ error: `Unknown scope: ${unknownScope}` }, { status: 400 });
  }

  const { key, keyPrefix, keyHash } = generateApiKey();

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      org_id: profile.org_id,
      name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes,
      created_by: user.id,
    })
    .select("id, name, key_prefix, scopes, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "create failed" }, { status: 500 });
  }

  return NextResponse.json({ ...data, apiKey: key });
}
