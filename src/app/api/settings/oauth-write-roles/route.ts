import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { CONFIGURABLE_WRITE_ROLES } from "@/lib/api/oauth";

const updateSchema = z.object({
  roles: z.array(z.enum(CONFIGURABLE_WRITE_ROLES)),
});

/** GET /api/settings/oauth-write-roles -- the org's configured non-admin
 * roles allowed to grant write access via the OAuth sign-in flow. */
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

  const { data: org, error } = await supabase
    .from("organizations")
    .select("oauth_write_roles")
    .eq("id", profile.org_id)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ roles: org.oauth_write_roles ?? [] });
}

/** PATCH /api/settings/oauth-write-roles -- sets which non-admin roles can
 * grant write access via OAuth. Admin-only, same as every other OAuth/API
 * key management action. */
export async function PATCH(request: Request) {
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

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { error } = await supabase
    .from("organizations")
    .update({ oauth_write_roles: parsed.data.roles })
    .eq("id", profile.org_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
