import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { EstimateDocument } from "@/components/crm/estimates/pdf/EstimateDocument";
import type { EstimatePDFData, EstimatePDFLineItem, EstimatePDFMilestone, EstimatePDFPhoto, OrgPDFData } from "@/components/crm/estimates/pdf/EstimateDocument";
import { toDisplaySettings } from "@/lib/estimate-display-settings";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Explicit org filter as defense-in-depth alongside RLS — same rationale
  // as the invoice PDF route (per CLAUDE.md, org_id must always be scoped
  // from the session, not implicit trust in a policy that could itself
  // change, e.g. a future crew-role RLS carve-out).
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── fetch estimate ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: est, error: estErr } = await (supabase as any)
    .from("estimates")
    .select(`
      *,
      clients(display_name, billing_address, billing_city, billing_state, billing_zip),
      estimate_line_items(*),
      estimate_milestones(name, amount_cents, sort_order, deleted_at)
    `)
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .single();

  if (estErr || !est) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const milestones: EstimatePDFMilestone[] = (est.estimate_milestones ?? [])
    .filter((m: Record<string, unknown>) => !m.deleted_at)
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0)
    )
    .map((m: Record<string, unknown>) => ({
      name: m.name as string,
      amountCents: (m.amount_cents as number) ?? 0,
    }));

  // ── fetch customer-facing photos ────────────────────────────────────────────
  // Storage signed URLs expire in an hour — download and base64-embed each one
  // now (same approach already used for the org logo) so the PDF stays valid
  // however long the buffer sits around before it's actually rendered/opened.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: photoRows } = await (supabase as any)
    .from("estimate_photos")
    .select("storage_path, caption, created_at")
    .eq("estimate_id", id)
    .eq("customer_facing", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const photos: EstimatePDFPhoto[] = [];
  for (const p of (photoRows ?? []) as Record<string, unknown>[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: signed } = await (supabase as any).storage
      .from("attachments")
      .createSignedUrl(p.storage_path as string, 3600);
    if (!signed?.signedUrl) continue;
    try {
      const imgRes = await fetch(signed.signedUrl);
      if (!imgRes.ok) continue;
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const mime = imgRes.headers.get("content-type") ?? "image/jpeg";
      photos.push({ caption: (p.caption as string | null) ?? null, dataUri: `data:${mime};base64,${buf.toString("base64")}` });
    } catch {
      // Skip a photo that failed to download rather than failing the whole PDF
    }
  }

  // ── fetch org settings ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("name, brand_color, address, customizations")
    .eq("id", est.org_id)
    .single();

  // ── build data shapes ───────────────────────────────────────────────────────
  const lineItems: EstimatePDFLineItem[] = (est.estimate_line_items ?? [])
    // Matches EstimateSummaryPanel's/recalcEstimateTotals's own line-item filter
    // (exclude soft-deleted and 'lost' rows) — previously hard-coded to only
    // status === "quote", so regenerating a PDF for an ACCEPTED estimate (whose
    // won line items flip to status "won") rendered a blank document with zero
    // line items.
    .filter((li: Record<string, unknown>) => !li.deleted_at && li.status !== "lost")
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0)
    )
    .map((li: Record<string, unknown>) => ({
      rowType: (li.row_type as "item" | "section") ?? "item",
      sectionName: li.section_name as string | null,
      serviceName: li.service_name as string | null,
      estimateDesc: li.estimate_desc as string | null,
      qty: (li.qty as number) ?? 1,
      unitType: li.unit_type as string | null,
      // computeLineItem prices totalCents off adjRateCents ?? rateCents (see
      // estimate-calc.ts) — using the raw rate_cents here made the printed
      // Rate column fail to reconcile against Total whenever a line used the
      // Adj Rate override. ConvertToJobDialog already applies this same
      // adjRateCents-first precedence when carrying a line item into a job.
      rateCents: (li.adj_rate_cents as number | null) ?? (li.rate_cents as number) ?? 0,
      visits: (li.visits as number) ?? 1,
      totalCents: (li.total_cents as number) ?? 0,
      tier: (li.tier as "basic" | "standard" | "premium" | null) ?? null,
    }));

  const addr = (org?.address as Record<string, string>) ?? {};
  const customizations = (org?.customizations as Record<string, unknown>) ?? {};

  const estimateData: EstimatePDFData = {
    estimateNumber: est.estimate_number as number,
    description: est.description as string | null,
    createdAt: est.created_at as string,
    validUntil: est.valid_until_date as string | null,
    notes: est.notes as string | null,
    clientName: est.clients?.display_name ?? null,
    clientAddress: est.clients?.billing_address ?? null,
    clientCity: est.clients?.billing_city ?? null,
    clientState: est.clients?.billing_state ?? null,
    clientZip: est.clients?.billing_zip ?? null,
    subtotalCents: (est.subtotal_cents as number) ?? 0,
    taxRateBps: (est.tax_rate_bps as number) ?? 0,
    taxCents: (est.tax_cents as number) ?? 0,
    discountCents: (est.discount_cents as number) ?? 0,
    showDiscounts: (est.show_discounts as boolean) ?? false,
    totalCents: (est.total_cents as number) ?? 0,
    paymentTerms: (est.payment_terms as string) ?? null,
    depositRequiredCents: (est.deposit_required_cents as number) ?? 0,
    numInstallments: (est.num_installments as number) ?? 1,
    installmentDayOfMonth: (est.installment_day_of_month as number | null) ?? null,
    paymentPlanType: (est.payment_plan_type as "installments" | "milestones") ?? "installments",
    milestones,
    tiersEnabled: (est.tiers_enabled as boolean) ?? false,
    tierLabels: (est.tier_labels as { basic: string; standard: string; premium: string }) ?? { basic: "Basic", standard: "Standard", premium: "Premium" },
    displaySettings: toDisplaySettings(est.display_settings),
    lineItems,
    photos,
  };

  const orgData: OrgPDFData = {
    name: (org?.name as string) ?? "",
    street: addr.street ?? "",
    city: addr.city ?? "",
    state: addr.state ?? "",
    zip: addr.zip ?? "",
    phone: addr.phone ?? "",
    brandColor: (org?.brand_color as string) ?? "#60ab45",
    logoUrl: (customizations.logoDataUrl as string) ?? null,
  };

  // ── render ──────────────────────────────────────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createElement(EstimateDocument as any, { estimate: estimateData, org: orgData }) as any
    );

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="estimate-${estimateData.estimateNumber}.pdf"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    console.error("PDF render error:", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
