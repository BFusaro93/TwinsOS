import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { PortalInviteRow } from "@/lib/portal/portal-db";

export async function POST(req: Request) {
  const { token, password } = await req.json();

  if (!token || !password || password.length < 8) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();

  // Validate the invite — cast because tables not yet in generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inviteRows, error: inviteErr } = await (supabase as any)
    .rpc("get_portal_invite_by_token", { p_token: token }) as { data: PortalInviteRow[] | null; error: unknown };
  const invite = inviteRows?.[0] ?? null;

  if (inviteErr || !invite) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }
  if (invite.accepted_at) {
    return NextResponse.json({ error: "Invite already used" }, { status: 410 });
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  // Use service role to create the Supabase auth user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = createServiceClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: {
      portal: true,
      client_id: invite.client_id,
      org_id: invite.org_id,
    },
  });

  if (authErr || !authData.user) {
    if (authErr?.message?.includes("already registered")) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: authErr?.message ?? "Registration failed" }, { status: 500 });
  }

  // Create portal user record and mark invite accepted — both in parallel
  await Promise.all([
    adminClient.from("client_portal_users").insert({
      org_id: invite.org_id,
      client_id: invite.client_id,
      user_id: authData.user.id,
      email: invite.email,
    }),
    adminClient
      .from("client_portal_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id),
  ]);

  return NextResponse.json({ success: true });
}
