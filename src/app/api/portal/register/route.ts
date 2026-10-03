import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
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

  // Supabase Auth users are global by email — a person who is already a
  // portal (or staff) user under a different org with the SAME email can't
  // get a second account. We link this invite to their existing account, but
  // ONLY when the request comes from that account's own signed-in session:
  // an invite token alone must never be enough to attach someone else's
  // existing login to a client record.
  const { data: existingUserIdRaw } = await adminClient.rpc("get_auth_user_id_by_email", { p_email: invite.email });
  const existingUserId = (existingUserIdRaw as string | null) ?? null;
  const signInRequired = () =>
    NextResponse.json(
      {
        error:
          "An account already exists for this email. Sign in to the portal with that account first, then open this invite link again to add this company.",
        code: "sign_in_required",
      },
      { status: 409 }
    );

  if (existingUserId) {
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    const sessionOwnsInviteEmail =
      !!sessionUser &&
      sessionUser.id === existingUserId &&
      (sessionUser.email ?? "").toLowerCase() === String(invite.email).toLowerCase();
    if (!sessionOwnsInviteEmail) return signInRequired();
  }

  // Claim the invite atomically — two concurrent submits of the same token
  // can't both get past this, whatever the earlier accepted_at read said.
  const { data: claimed, error: claimErr } = await adminClient
    .from("client_portal_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("accepted_at", null)
    .select("id");
  if (claimErr) return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: "Invite already used" }, { status: 410 });
  }
  const releaseClaim = () =>
    adminClient.from("client_portal_invites").update({ accepted_at: null }).eq("id", invite.id);

  let userId: string;
  const linkedExisting = !!existingUserId;

  if (existingUserId) {
    userId = existingUserId;
  } else {
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
      await releaseClaim();
      // Lost a race with another registration for the same email.
      if (authErr?.message?.includes("already registered")) return signInRequired();
      logger.child("portal-register").error("createUser failed", { error: authErr?.message });
      return NextResponse.json({ error: "Registration failed" }, { status: 500 });
    }
    userId = authData.user.id;
  }

  // Create/attach the portal user record.
  const { error: linkErr } = await adminClient
    .from("client_portal_users")
    .upsert(
      // deleted_at: null covers re-registering after a previously-revoked
      // portal account for this same org — otherwise the upsert's ON
      // CONFLICT branch would update the other fields but leave the row
      // soft-deleted, silently failing to restore access.
      { org_id: invite.org_id, client_id: invite.client_id, user_id: userId, email: invite.email, deleted_at: null },
      { onConflict: "user_id,org_id" }
    );
  if (linkErr) {
    await releaseClaim();
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }

  // linkedExisting: the password submitted on this form was never set on
  // the account — the person is already signed in with their existing
  // account. The frontend must not attempt an auto sign-in with the
  // just-typed password in this case.
  return NextResponse.json({ success: true, linkedExisting });
}
