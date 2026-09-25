import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { EstimateDocument, EstimateDocumentMulti } from "@/components/crm/estimates/pdf/EstimateDocument";
import type { EstimatePDFData, EstimatePDFLineItem, EstimatePDFMilestone, EstimatePDFPhoto, OrgPDFData } from "@/components/crm/estimates/pdf/EstimateDocument";
import { toDisplaySettings } from "@/lib/estimate-display-settings";
import { getPublishedProposal } from "@/lib/estimates/proposal-content";

// Shared by the single-estimate and bulk PDF routes, plus the
// accepted-estimate notification email (estimate-client-notify.ts) — the
// fetch/build logic is identical either way, only what wraps the result
// (one <EstimateDocument> vs. several inside <EstimateDocumentMulti>) differs.
async function buildEstimatePDFData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  estimateId: string,
  orgId: string,
  opts: { published?: boolean } = {}
): Promise<{ estimate: EstimatePDFData; org: OrgPDFData } | null> {
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

  const { data: photoRows } = await supabase
    .from("estimate_photos")
    .select("storage_path, caption, created_at")
    .eq("estimate_id", estimateId)
    .eq("customer_facing", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const photos: EstimatePDFPhoto[] = [];
  for (const p of (photoRows ?? []) as Record<string, unknown>[]) {
    const { data: signed } = await supabase.storage
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

  const { data: org } = await supabase
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
      // Without this the printed Rate is the UNSCALED rate while the Total
      // carries the complexity multiplier, so a client reading their own
      // proposal multiplies Qty x Rate and lands on a different number than
      // the Total beside it (5,000 @ $0.12 at 125% prints "0.12" and
      // "750.00"). EstimateDocument scales the printed rate from this field;
      // the emailed copy already passes it.
      complexityBps: (li.complexity_bps as number | null) ?? null,
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

  // Client-facing copies of a sent estimate print the version the client was
  // sent, not unsent edits (see lib/estimates/proposal-content.ts).
  if (opts.published && est.stage === "sent") {
    const published = await getPublishedProposal(supabase, estimateId);
    if (published) {
      const c = published.content;
      Object.assign(estimateData, {
        description: c.description,
        validUntil: c.validUntil,
        notes: c.notes,
        subtotalCents: c.subtotalCents,
        taxRateBps: c.taxRateBps,
        taxCents: c.taxCents,
        discountCents: c.discountCents,
        showDiscounts: c.showDiscounts,
        totalCents: c.totalCents,
        depositRequiredCents: c.depositRequiredCents,
        tiersEnabled: c.tiersEnabled,
        tierLabels: c.tierLabels,
        displaySettings: c.displaySettings,
        lineItems: c.lineItems.map((li) => ({
          rowType: li.rowType,
          sectionName: li.sectionName,
          serviceName: li.serviceName,
          estimateDesc: li.estimateDesc,
          qty: li.qty,
          unitType: li.unitType,
          rateCents: li.adjRateCents ?? li.rateCents,
          visits: li.visits,
          totalCents: li.totalCents,
          tier: (li.tier as "basic" | "standard" | "premium" | null) ?? null,
          complexityBps: li.complexityBps,
        })),
      });
    }
  }

  return { estimate: estimateData, org: orgData };
}

export async function renderEstimatePDF(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  estimateId: string,
  orgId: string,
  opts: { published?: boolean } = {}
): Promise<Buffer | null> {
  const built = await buildEstimatePDFData(supabase, estimateId, orgId, opts);
  if (!built) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createElement(EstimateDocument as any, built) as any
    );
    return buffer as unknown as Buffer;
  } catch (err) {
    console.error("PDF render error:", err);
    return null;
  }
}

/** Combines several estimates into one PDF — used by the Estimates list's
 *  "Print Selected" bulk action. Estimates that fail to load (deleted,
 *  wrong org) are silently skipped rather than failing the whole batch. */
export async function renderEstimatesPDF(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  estimateIds: string[],
  orgId: string
): Promise<Buffer | null> {
  const items = (
    await Promise.all(estimateIds.map((id) => buildEstimatePDFData(supabase, id, orgId)))
  ).filter((x): x is { estimate: EstimatePDFData; org: OrgPDFData } => x !== null);
  if (items.length === 0) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createElement(EstimateDocumentMulti as any, { items }) as any
    );
    return buffer as unknown as Buffer;
  } catch (err) {
    console.error("PDF render error:", err);
    return null;
  }
}
