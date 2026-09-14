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

  let userId: string;
  let linkedExisting = false;

  if (authErr || !authData.user) {
    // Supabase Auth users are global by email — a person who is already a
    // portal (or staff) user under a different org with the SAME email hits
    // this every time, not just on a rare collision. Rather than dead-end
    // registration, link this invite's org to their existing auth user
    // instead of creating a second one. client_portal_users now allows one
    // row per (user_id, org_id) — see 20260825000000_client_portal_multi_org.
    if (authErr?.message?.includes("already registered")) {
      const { data: existingUserId } = await adminClient.rpc("get_auth_user_id_by_email", { p_email: invite.email });
      if (!existingUserId) {
        return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
      }
      userId = existingUserId as string;
      linkedExisting = true;
    } else {
      return NextResponse.json({ error: authErr?.message ?? "Registration failed" }, { status: 500 });
    }
  } else {
    userId = authData.user.id;
  }

  // Create/attach the portal user record and mark invite accepted — both in parallel
  await Promise.all([
    adminClient
      .from("client_portal_users")
      .upsert(
        // deleted_at: null covers re-registering after a previously-revoked
        // portal account for this same org — otherwise the upsert's ON
        // CONFLICT branch would update the other fields but leave the row
        // soft-deleted, silently failing to restore access.
        { org_id: invite.org_id, client_id: invite.client_id, user_id: userId, email: invite.email, deleted_at: null },
        { onConflict: "user_id,org_id" }
      ),
    adminClient
      .from("client_portal_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id),
  ]);

  // linkedExisting: the password submitted on this form was never set on
  // the account — the person needs to sign in with whatever password their
  // FIRST org's portal account already uses. The frontend must not attempt
  // an auto sign-in with the just-typed password in this case.
  return NextResponse.json({ success: true, linkedExisting });
}
