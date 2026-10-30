import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe/server";
import { rejectIfImpersonating } from "@/lib/auth/impersonation-guard";

const STATE_COOKIE = "stripe_connect_oauth_state";

/**
 * POST /api/crm/payments/connect/oauth/start — begins Stripe Connect OAuth so
 * an org can link an EXISTING Stripe account (instead of the onboarding route,
 * which always creates a brand-new Standard account). Standard accounts can
 * authorize multiple platforms at once, so this doesn't disturb whatever else
 * (e.g. another CRM) the account is already connected to.
 *
 * Live mode only: STRIPE_CONNECT_CLIENT_ID is the platform's live `ca_…` ID,
 * and the callback exchanges the code with the live secret key.
 */
export async function POST(request: Request) {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!clientId || !isStripeConfigured()) {
    return NextResponse.json({ error: "Linking an existing Stripe account is not configured yet" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Only admins can manage payment settings" }, { status: 403 });
  }

  // Stripe's login belongs to the customer's own admin, and the callback writes to the caller's HOME org.
  const impersonating = await rejectIfImpersonating(supabase, user.id, "connecting Stripe (the customer's own admin needs to do this)");
  if (impersonating) return impersonating;

  const state = randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const origin = new URL(request.url).origin;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    state,
    redirect_uri: `${origin}/api/crm/payments/connect/oauth/callback`,
  });
  if (user.email) params.set("stripe_user[email]", user.email);

  return NextResponse.json({ url: `https://connect.stripe.com/oauth/authorize?${params.toString()}` });
}
