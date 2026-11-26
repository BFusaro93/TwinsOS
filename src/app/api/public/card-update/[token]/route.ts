import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveCardUpdateToken } from "@/lib/card-update/resolve";
import { orgCardPaymentsAvailable } from "@/lib/stripe/card-payments-available";
import { loadPortalFeatureSettings } from "@/lib/portal/portal-feature-settings";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";

const log = logger.child("public-card-update");

// Public route — no auth. The token resolves org + client server-side; nothing the
// browser sends picks which client is read or changed.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  if (!(await checkAuthRateLimit(`card-update-view:ip:${ip}`, 60, 600))) {
    return NextResponse.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });
  }

  const db = createServiceClient();
  const resolved = await resolveCardUpdateToken(db, token);
  if (!resolved) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });

  const [{ data: client }, { data: org }, features] = await Promise.all([
    db
      .from("clients")
      .select("first_name, display_name, saved_payment_method_summary, saved_payment_method_id, autopay_enabled")
      .eq("id", resolved.clientId)
      .eq("org_id", resolved.orgId)
      .is("deleted_at", null)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.from("organizations") as any)
      .select("name, brand_color, customizations, stripe_connect_account_id, stripe_connect_charges_enabled")
      .eq("id", resolved.orgId)
      .single(),
    loadPortalFeatureSettings(resolved.orgId),
  ]);
  if (!client || !org) {
    log.error("card-update token resolved but client/org missing", { tokenId: resolved.id });
    return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  }

  const displayName = (client.display_name as string | null) ?? "";
  return NextResponse.json({
    state: resolved.state,
    clientFirstName: (client.first_name as string | null)?.trim() || displayName.split(" ")[0] || null,
    org: {
      name: (org.name as string | null) ?? "",
      brandColor: (org.brand_color as string | null) ?? "#60ab45",
      logoUrl: ((org.customizations as Record<string, unknown> | null)?.logoDataUrl as string | undefined) ?? null,
    },
    cardPaymentsAvailable: orgCardPaymentsAvailable(org),
    autopayAllowed: features.allowAutopay,
    currentMethod: client.saved_payment_method_id ? ((client.saved_payment_method_summary as string | null) ?? "A payment method") : null,
    autopayOn: client.autopay_enabled === true,
  });
}
