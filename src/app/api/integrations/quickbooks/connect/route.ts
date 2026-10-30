import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isQuickBooksConfigured, getAuthorizeUrl, generateState, resolveQuickBooksEnvironment } from "@/lib/integrations/quickbooks";

const STATE_COOKIE = "qbo_oauth_state";

/** GET /api/integrations/quickbooks/connect — starts the OAuth2 flow. Admin-only, redirects to Intuit. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Only admins can connect QuickBooks" }, { status: 403 });
  }

  if (!isQuickBooksConfigured(profile.org_id)) {
    return NextResponse.json({ error: "QuickBooks is not configured" }, { status: 400 });
  }

  const state = generateState();
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/integrations/quickbooks/callback`;

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(getAuthorizeUrl(redirectUri, state, resolveQuickBooksEnvironment(profile.org_id)));
}
