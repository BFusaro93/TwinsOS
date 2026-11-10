import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/api/auth";
import { isKnownScope } from "@/lib/api/scopes";
import { orgHasAddon } from "@/lib/stripe/addon-access";
import { firstIssueMessage } from "@/lib/utils/zod-message";

const log = logger.child("settings-api-keys");

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

  const { data: profile } = await supabase.from("profiles").select("org_id, role, status").eq("id", user.id).single();
  if (!profile || profile.role !== "admin" || profile.status === "inactive") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, scopes, rate_limit_per_min, last_used_at, revoked_at, created_at, created_by")
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    log.error("request failed", { error: error.message });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  // Who created each key — a key keeps working after its creator is
  // deactivated, so the list flags those ("created by X (deactivated)") and
  // the Users page's deactivate dialog offers to revoke them.
  const creatorIds = [...new Set((data ?? []).map((k) => k.created_by).filter((id): id is string => !!id))];
  const creators = new Map<string, { name: string | null; status: string | null }>();
  if (creatorIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, name, status").in("id", creatorIds);
    for (const p of profiles ?? []) creators.set(p.id, { name: p.name ?? null, status: p.status ?? null });
  }

  return NextResponse.json({
    keys: (data ?? []).map((k) => {
      const creator = k.created_by ? creators.get(k.created_by) : undefined;
      return {
        ...k,
        created_by_name: creator?.name ?? null,
        created_by_inactive: creator?.status === "inactive",
      };
    }),
  });
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

  const { data: profile } = await supabase.from("profiles").select("org_id, role, status").eq("id", user.id).single();
  if (!profile || profile.role !== "admin" || profile.status === "inactive") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  if (!(await orgHasAddon(supabase, profile.org_id, "api_access"))) {
    return NextResponse.json(
      { error: "API access isn't included on your plan. Add it in Settings → Subscription before creating a key." },
      { status: 403 }
    );
  }

  const parsed = createKeySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error, "Invalid input") }, { status: 400 });
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
    log.error("request failed", { error: error?.message });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ ...data, apiKey: key });
}
