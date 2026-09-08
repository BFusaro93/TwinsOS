import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { EstimateDocument } from "@/components/crm/estimates/pdf/EstimateDocument";
import type { EstimatePDFData, EstimatePDFLineItem, EstimatePDFMilestone, EstimatePDFPhoto, OrgPDFData } from "@/components/crm/estimates/pdf/EstimateDocument";
import { toDisplaySettings } from "@/lib/estimate-display-settings";

// Shared with the estimates/[id]/pdf route — extracted so the accepted-estimate
// notification email (estimate-client-notify.ts) can attach the same PDF
// without duplicating the fetch/build logic.
export async function renderEstimatePDF(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  estimateId: string,
  orgId: string
): Promise<Buffer | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: est, error: estErr } = await (supabase as any)
    .from("estimates")
    .select(`
      *,
      clients(display_name, billing_address, billing_city, billing_state, billing_zip),
      estimate_line_items(*),
      estimate_milestones(name, amount_cents, sort_order, deleted_at)
    `)
    .eq("id", estimateId)
    .eq("org_id", orgId)
    .single();

  if (estErr || !est) return null;

  const milestones: EstimatePDFMilestone[] = (est.estimate_milestones ?? [])
    .filter((m: Record<string, unknown>) => !m.deleted_at)
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0)
    )
    .map((m: Record<string, unknown>) => ({
      name: m.name as string,
      amountCents: (m.amount_cents as number) ?? 0,
    }));

  const { data: photoRows } = await (supabase as any)
    .from("estimate_photos")
    .select("storage_path, caption, created_at")
    .eq("estimate_id", estimateId)
    .eq("customer_facing", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const photos: EstimatePDFPhoto[] = [];
  for (const p of (photoRows ?? []) as Record<string, unknown>[]) {
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

  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("name, brand_color, address, customizations")
    .eq("id", est.org_id)
    .single();

  const lineItems: EstimatePDFLineItem[] = (est.estimate_line_items ?? [])
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

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createElement(EstimateDocument as any, { estimate: estimateData, org: orgData }) as any
    );
    return buffer as unknown as Buffer;
  } catch (err) {
    console.error("PDF render error:", err);
    return null;
  }
}
