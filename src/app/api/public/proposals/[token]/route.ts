import { NextRequest, NextResponse } from "next/server";
import { isEstimatePastValidUntil } from "@/lib/estimates/validity";
import { createClient } from "@supabase/supabase-js";
import { buildProposalContent, getPublishedProposal } from "@/lib/estimates/proposal-content";
import { isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";

// Public route — no auth. Uses service role to read across RLS.
const serviceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = serviceClient();

  // Look up the token
  const { data: shareToken, error: tokenErr } = await supabase
    .from("estimate_share_tokens")
    .select("*")
    .eq("token", token)
    .is("deleted_at", null)
    .single();

  if (tokenErr || !shareToken) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
    return NextResponse.json({ error: "This proposal link has expired" }, { status: 410 });
  }

  // Record view (fire-and-forget — don't let tracking failures block the response)
  const now = new Date().toISOString();
  supabase
    .from("estimate_share_tokens")
    .update({
      first_viewed_at: shareToken.first_viewed_at ?? now,
      last_viewed_at: now,
      view_count: (shareToken.view_count ?? 0) + 1,
    })
    .eq("id", shareToken.id)
    .then(() => {/* intentionally ignored */});

  // Fetch estimate with client info and line items
  const { data: est, error: estErr } = await supabase
    .from("estimates")
    .select(`
      *,
      clients(display_name, billing_address, billing_city, billing_state, billing_zip),
      client_properties(address, city, state, zip),
      estimate_line_items(*),
      estimate_direct_costs(id, description, qty, rate_cents, total_cents, sort_order)
    `)
    .eq("id", shareToken.estimate_id)
    .single();

  if (estErr || !est) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  // Fetch customer-facing photos — signed URLs are fine here (unlike the PDF,
  // this route is hit live on every page load, not rendered once and stored).
  const { data: photoRows } = await supabase
    .from("estimate_photos")
    .select("id, storage_path, caption")
    .eq("estimate_id", shareToken.estimate_id)
    .eq("customer_facing", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const photos = await Promise.all(
    ((photoRows ?? []) as Record<string, unknown>[]).map(async (p) => {
      const { data: signed } = await supabase.storage
        .from("attachments")
        .createSignedUrl(p.storage_path as string, 3600);
      return { id: p.id as string, caption: (p.caption as string | null) ?? null, signedUrl: signed?.signedUrl ?? null };
    })
  );

  // Fetch org
  const { data: org } = await supabase
    .from("organizations")
    .select("name, brand_color, address, customizations, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_livemode, ach_payments_enabled")
    .eq("id", shareToken.org_id)
    .single();

  const addr = (org?.address as Record<string, string>) ?? {};
  const customizations = (org?.customizations as Record<string, unknown>) ?? {};

  const client = (est.clients as Record<string, string | null> | null) ?? {};
  const property = (est.client_properties as Record<string, string | null> | null) ?? null;
  const addressLines = (street: string | null | undefined, city: string | null | undefined, state: string | null | undefined, zip: string | null | undefined) => {
    const cityLine = [[city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ");
    return [street, cityLine].map((l) => (l ?? "").trim()).filter(Boolean);
  };
  const clientAddressLines = addressLines(client.billing_address, client.billing_city, client.billing_state, client.billing_zip);
  const propertyLines = property ? addressLines(property.address, property.city, property.state, property.zip) : [];
  const sameAsBilling = propertyLines.join("|").toLowerCase() === clientAddressLines.join("|").toLowerCase();
  const serviceAddressLines = propertyLines.length > 0 && !sameAsBilling ? propertyLines : null;

  // The client sees the last SENT version, not the live estimate — staff can
  // keep editing a sent estimate without the client seeing (or accepting) a
  // half-finished revision. Falls back to live content when nothing has been
  // published with proposal content yet (estimates sent before this change).
  const published = await getPublishedProposal(supabase, shareToken.estimate_id);
  const content = published?.content ?? buildProposalContent(est as Record<string, unknown>);

  return NextResponse.json({
    estimateNumber: est.estimate_number,
    description: content.description,
    createdAt: est.created_at,
    validUntil: content.validUntil,
    // Expiry follows the version the client is looking at.
    expired: await isEstimatePastValidUntil(supabase, shareToken.org_id, content.validUntil),
    notes: content.notes,
    stage: est.stage,
    alreadyAccepted: !!shareToken.accepted_at,
    acceptedAt: shareToken.accepted_at ?? null,
    acceptedByName: shareToken.accepted_by_name ?? null,

    clientName: client.display_name ?? null,
    clientAddressLines,
    serviceAddressLines,

    orgName: org?.name ?? "",
    orgPhone: addr.phone ?? "",
    orgBrandColor: (org?.brand_color as string) ?? "#60ab45",
    orgLogoUrl: (customizations.logoDataUrl as string) ?? null,

    // Stored totals are authoritative — the page displays these as-is and only
    // re-derives (with the same discount rule as recalcEstimateTotals) when
    // the client deselects items or picks a tier.
    // Materials/equipment/subcontract lines. They are priced into
    // subtotal_cents and total_cents, so a proposal that renders only
    // estimate_line_items shows a total the client cannot reconcile — and,
    // worse, deselecting any optional item re-derived the price from line
    // items alone and silently dropped these from what the client accepted.
    directCosts: content.directCosts,
    subtotalCents: content.subtotalCents,
    taxRateBps: content.taxRateBps,
    taxCents: content.taxCents,
    discountCents: content.discountCents,
    discountType: content.discountType,
    discountValue: content.discountValue,
    showDiscounts: content.showDiscounts,
    totalCents: content.totalCents,

    tiersEnabled: content.tiersEnabled,
    tierLabels: content.tierLabels,
    displaySettings: content.displaySettings,

    depositRequiredCents: content.depositRequiredCents,
    depositCollectedCents: (est.deposit_collected_cents as number) ?? 0,
    // A deposit the bank returned or the card declined. Drives the retry
    // screen an already-accepted proposal shows instead of the plain thank-you
    // — the only route back for a client whose ACH bounced days later. The
    // reason is Stripe's own wording; it says nothing about the payment
    // instrument beyond what the payer already knows.
    depositFailedCents: (est.deposit_failed_cents as number | null) ?? null,
    depositFailedReason: (est.deposit_failed_reason as string | null) ?? null,
    depositFailedMethod: (est.deposit_failed_method as "card" | "us_bank_account" | null) ?? null,
    depositFailedAt: (est.deposit_failed_at as string | null) ?? null,
    // Whether the deposit step can offer a real card charge, or only the
    // self-reported "I'll send a check" methods. Gated on the platform having
    // Stripe keys AND this org having finished Connect onboarding — an org
    // that hasn't still gets the manual methods and the Skip button.
    cardDepositAvailable:
      (isStripeConfigured() || isStripeTestConfigured()) &&
      !!org?.stripe_connect_account_id &&
      !!org?.stripe_connect_charges_enabled,
    orgLivemode: org?.stripe_connect_livemode ?? true,
    // The org-level toggle only. Whether the connected account actually has
    // the ACH capability is a Stripe API call, too slow to make on every
    // proposal view — the deposit-intent route does that check and returns a
    // clear "pay by card instead" error if it isn't really available.
    achDepositAvailable: !!org?.ach_payments_enabled,

    lineItems: content.lineItems,
    photos,
  });
}
