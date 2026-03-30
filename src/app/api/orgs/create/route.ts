import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/orgs/create
 *
 * Public endpoint (no auth required — caller is a prospective new tenant).
 * Creates an organization row using the service role and returns its id.
 * The caller is then expected to call supabase.auth.signUp() on the client
 * side, passing org_id in user_metadata so the handle_new_user trigger
 * auto-creates an admin profile.
 */
export async function POST(request: Request) {
  let body: { companyName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyName = body.companyName?.trim();
  if (!companyName) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  }

  // Service role is required — the organizations table is RLS-protected and
  // anonymous users cannot insert rows directly.
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: org, error: orgErr } = await adminClient
    .from("organizations")
    .insert({ name: companyName })
    .select("id")
    .single();

  if (orgErr || !org) {
    return NextResponse.json(
      { error: orgErr?.message ?? "Failed to create organization" },
      { status: 500 }
    );
  }

  return NextResponse.json({ orgId: org.id }, { status: 200 });
}
