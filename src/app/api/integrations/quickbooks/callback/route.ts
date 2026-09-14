import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/integrations/quickbooks";
import { logger } from "@/lib/logger";

const log = logger.child("quickbooks-callback");
const STATE_COOKIE = "qbo_oauth_state";

/** GET /api/integrations/quickbooks/callback — Intuit redirects here after the user approves/denies access. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const settingsUrl = `${url.origin}/crm/settings?tab=accounting`;

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (!code || !state || !realmId || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${settingsUrl}&quickbooks=error`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${settingsUrl}&quickbooks=error`);

  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return NextResponse.redirect(`${settingsUrl}&quickbooks=error`);

  try {
    const tokens = await exchangeCodeForTokens(code, `${url.origin}/api/integrations/quickbooks/callback`);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error } = await supabase.from("integrations").upsert(
      {
        org_id: profile.org_id,
        provider: "quickbooks",
        config: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          realm_id: realmId,
          expires_at: expiresAt,
        },
        enabled: true,
        last_sync_at: new Date().toISOString(),
        last_sync_status: "ok",
      },
      { onConflict: "org_id,provider" }
    );
    if (error) throw error;

    return NextResponse.redirect(`${settingsUrl}&quickbooks=connected`);
  } catch (err) {
    log.error("QuickBooks OAuth exchange failed", { err, orgId: profile.org_id });
    return NextResponse.redirect(`${settingsUrl}&quickbooks=error`);
  }
}
