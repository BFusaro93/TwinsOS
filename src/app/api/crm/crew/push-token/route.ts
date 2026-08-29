import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth } from "@/lib/supabase/route-auth";

const Body = z.object({ expoPushToken: z.string().min(1) });

/**
 * POST /api/crm/crew/push-token — called once on login (and whenever the
 * token changes) by crew-app's push-notification registration
 * (crew-app/src/lib/notifications.ts). Upserts into crew_push_tokens
 * (supabase/migrations/20260827180500_crew_push_tokens.sql), one row per
 * user. Storage only — nothing reads this table to actually send a push
 * yet; see src/lib/notifications/send-push.ts for the stub a future
 * engineer wires up once a real EAS project exists.
 *
 * Uses the caller's own RLS-scoped session (not the admin client) — unlike
 * requisitions, crew_push_tokens has no role restriction, since it carries
 * no business data and a user may always manage their own token row.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = profile?.org_id as string | undefined;
  if (!orgId) return NextResponse.json({ error: "No organization for this user" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("crew_push_tokens")
    .upsert(
      { user_id: user.id, org_id: orgId, expo_push_token: parsed.data.expoPushToken },
      { onConflict: "user_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/crew/push-token — called on sign-out (crew-app's
 * handleSignOut, before supabase.auth.signOut()). Without this, a stale
 * token row for the signing-out user survives on this physical device; on a
 * shared crew device, once push sending exists, the next person to sign in
 * without restarting the app would never get their own token registered
 * (registerForPushNotificationsAsync() no-ops once already registered this
 * session) while the previous user's row — still pointing at this device —
 * would keep receiving pushes meant for them.
 */
export async function DELETE(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("crew_push_tokens")
    .delete()
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
