import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { toDisplaySettings } from "@/lib/estimate-display-settings";

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
      clients(display_name),
      estimate_line_items(*)
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
    .select("name, brand_color, address, customizations")
    .eq("id", shareToken.org_id)
    .single();

  const addr = (org?.address as Record<string, string>) ?? {};
  const customizations = (org?.customizations as Record<string, unknown>) ?? {};

  const lineItems = ((est.estimate_line_items ?? []) as Record<string, unknown>[])
    .filter((li) => !li.deleted_at && li.status === "quote")
    .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
    .map((li) => ({
      id: li.id as string,
      rowType: ((li.row_type as string) ?? "item") as "item" | "section",
      sectionName: li.section_name as string | null,
      serviceName: li.service_name as string | null,
      estimateDesc: li.estimate_desc as string | null,
      qty: (li.qty as number) ?? 1,
      unitType: li.unit_type as string | null,
      rateCents: (li.rate_cents as number) ?? 0,
      visits: (li.visits as number) ?? 1,
      totalCents: (li.total_cents as number) ?? 0,
      status: li.status as string,
      tier: li.tier as string | null,
    }));

  return NextResponse.json({
    estimateNumber: est.estimate_number,
    description: est.description ?? null,
    createdAt: est.created_at,
    validUntil: est.valid_until ?? null,
    notes: est.notes ?? null,
    stage: est.stage,
    alreadyAccepted: !!shareToken.accepted_at,
    acceptedAt: shareToken.accepted_at ?? null,
    acceptedByName: shareToken.accepted_by_name ?? null,

    clientName: (est.clients as Record<string, unknown> | null)?.display_name ?? null,

    orgName: org?.name ?? "",
    orgPhone: addr.phone ?? "",
    orgBrandColor: (org?.brand_color as string) ?? "#60ab45",
    orgLogoUrl: (customizations.logoDataUrl as string) ?? null,

    subtotalCents: est.subtotal_cents ?? 0,
    taxRateBps: est.tax_rate_bps ?? 0,
    taxCents: est.tax_cents ?? 0,
    discountCents: est.discount_cents ?? 0,
    showDiscounts: est.show_discounts ?? false,
    totalCents: est.total_cents ?? 0,

    tiersEnabled: est.tiers_enabled ?? false,
    tierLabels: (est.tier_labels as { basic: string; standard: string; premium: string }) ?? { basic: 'Basic', standard: 'Standard', premium: 'Premium' },
    displaySettings: toDisplaySettings(est.display_settings),

    depositRequiredCents: (est.deposit_required_cents as number) ?? 0,
    depositCollectedCents: (est.deposit_collected_cents as number) ?? 0,

    lineItems,
    photos,
  });
}
