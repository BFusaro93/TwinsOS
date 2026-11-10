import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

const Query = z.object({ uid: z.string().uuid() });

/**
 * GET /api/auth/invite-status?uid=… — public (the person isn't signed in).
 *
 * An invite link is single-use. Opened a second time — after the person has
 * already set their password — /reset-password told them to "ask your admin to
 * send a new invite", which sent admins re-inviting people who were already
 * set up. The invite email's link carries the invitee's auth user id (uid), and
 * this says only whether that account is already an active login, so the page
 * can say "You're already set up — sign in" instead.
 *
 * Returns nothing but a boolean for an unguessable id: no name, email or org.
 */
export async function GET(request: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ active: false });

  const db = createServiceClient();
  const { data } = await db.from("profiles").select("status").eq("id", parsed.data.uid).maybeSingle();
  return NextResponse.json({ active: data?.status === "active" });
}
