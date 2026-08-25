import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Resend } from "resend";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { EstimateDocument } from "@/components/crm/estimates/pdf/EstimateDocument";
import type { EstimatePDFData, EstimatePDFLineItem, EstimatePDFMilestone, EstimatePDFPhoto, OrgPDFData } from "@/components/crm/estimates/pdf/EstimateDocument";
import { toDisplaySettings } from "@/lib/estimate-display-settings";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { addParagraphSpacing } from "@/lib/utils/document-template-renderer";

const FROM = "Twins Lawn Service <noreply@twinslawnservice.com>";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getNextVersionNumber(supabase: any, estimateId: string): Promise<number> {
  const { count } = await supabase
    .from("estimate_versions")
    .select("*", { count: "exact", head: true })
    .eq("estimate_id", estimateId);
  return (count ?? 0) + 1;
}

function resolveMergeTags(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\[(\w+)\]/g, (match) => {
    const key = match.toLowerCase();
    return vars[key] ?? match;
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: estimateId } = await params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    templateId?: string;
    subject: string;
    bodyHtml: string;
    expiresInDays?: number;
    ccEmails?: string[];
    to?: string[];
    includePdf?: boolean;
  };

  if (!body.subject?.trim() || !body.bodyHtml?.trim()) {
    return NextResponse.json({ error: "subject and bodyHtml are required" }, { status: 400 });
  }

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
  if (body.to?.some((e) => !isValidEmail(e))) {
    return NextResponse.json({ error: "Invalid recipient email address" }, { status: 400 });
  }

  // Fetch estimate + client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: est, error: estErr } = await (supabase as any)
    .from("estimates")
    .select(`
      *,
      clients(display_name, primary_email, billing_address, billing_city, billing_state, billing_zip),
      sales_rep:crm_employees!estimates_sales_rep_id_fkey(first_name,last_name),
      estimate_line_items(*),
      estimate_milestones(name, amount_cents, sort_order, deleted_at)
    `)
    .eq("id", estimateId)
    .single();

  if (estErr || !est) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const toEmails = (body.to && body.to.length > 0)
    ? body.to.map((e) => e.trim())
    : (est.clients?.primary_email ? [est.clients.primary_email as string] : []);
  if (toEmails.length === 0) {
    return NextResponse.json({ error: "Client has no email address on file" }, { status: 422 });
  }
  const toEmailsJoined = toEmails.join(", ");

  // Fetch org
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = profile?.org_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase as any).from("organizations").select("name, brand_color, address, customizations").eq("id", profile.org_id).single()
    : { data: null };

  const orgName = org?.name ?? "Your Service Provider";
  const orgPhone = ((org?.address as Record<string, string>) ?? {}).phone ?? "";

  // Create or reuse a share token
  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString()
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: shareToken, error: tokenErr } = await (supabase as any)
    .from("estimate_share_tokens")
    .insert({
      org_id: profile?.org_id,
      estimate_id: estimateId,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select("token")
    .single();

  if (tokenErr || !shareToken) {
    return NextResponse.json({ error: "Failed to create share token" }, { status: 500 });
  }

  const proposalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://twins-os.vercel.app"}/proposal/${shareToken.token}`;

  const clientDisplayName = (est.clients?.display_name as string) ?? "";
  const firstName = clientDisplayName.split(" ")[0] ?? clientDisplayName;
  const lastName = clientDisplayName.split(" ").slice(1).join(" ") ?? "";
  const salesRep = est.sales_rep as { first_name?: string; last_name?: string } | null;
  const salesRepName = salesRep ? `${salesRep.first_name ?? ""} ${salesRep.last_name ?? ""}`.trim() || orgName : orgName;
  const total = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format((est.total_cents ?? 0) / 100);
  const quoteDate = new Date(est.created_at).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const mergeVars: Record<string, string> = {
    "[clientfirstname]":    firstName,
    "[clientlastname]":     lastName,
    "[clientfullname]":     clientDisplayName,
    "[companyname]":        orgName,
    "[quotelink]":          `<a href="${proposalUrl}" style="color:#fff;background:${org?.brand_color ?? "#60ab45"};padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:600;display:inline-block">View Your Proposal →</a>`,
    "[quotenumber]":        String(est.estimate_number).padStart(5, "0"),
    "[quotedate]":          quoteDate,
    "[quotetotal]":         total,
    "[salesrepname]":       salesRepName,
    "[companyphonenumber]": orgPhone,
  };

  const resolvedSubject = resolveMergeTags(body.subject, mergeVars);
  const resolvedBody    = addParagraphSpacing(resolveMergeTags(body.bodyHtml, mergeVars));

  // "Include PDF" — the template's setting, forwarded by the send dialog.
  // Defaults to true (PDF attached) to preserve prior behavior when no
  // template is selected.
  const includePdf = body.includePdf !== false;

  // Snapshot estimate state at time of send
  const versionNumber = await getNextVersionNumber(supabase, estimateId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineItems = ((est.estimate_line_items ?? []) as any[])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((li: any) => !li.deleted_at)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("estimate_versions").insert({
    org_id: est.org_id,
    estimate_id: estimateId,
    version_number: versionNumber,
    sent_to_email: toEmailsJoined,
    created_by: user.id,
    snapshot: {
      estimateNumber: est.estimate_number,
      description: est.description,
      stage: est.stage,
      subtotalCents: est.subtotal_cents,
      taxCents: est.tax_cents,
      discountCents: est.discount_cents,
      totalCents: est.total_cents,
      notes: est.notes,
      validUntil: est.valid_until,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lineItems: lineItems.map((li: any) => ({
        id: li.id,
        serviceName: li.service_name,
        qty: li.qty,
        rateCents: li.rate_cents,
        visits: li.visits,
        totalCents: li.total_cents,
        unitType: li.unit_type,
        estimateDesc: li.estimate_desc,
        status: li.status,
        rowType: li.row_type ?? "item",
        sectionName: li.section_name,
      })),
    },
  });

  // Render the estimate PDF for attachment — same pipeline as the "Preview"/
  // "Print" buttons (src/app/api/crm/estimates/[id]/pdf/route.ts).
  const milestones: EstimatePDFMilestone[] = (est.estimate_milestones ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((m: any) => !m.deleted_at)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => ({ name: m.name as string, amountCents: (m.amount_cents as number) ?? 0 }));

  const pdfLineItems: EstimatePDFLineItem[] = lineItems
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((li: any) => li.status === "quote")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((li: any) => ({
      rowType: (li.row_type as "item" | "section") ?? "item",
      sectionName: li.section_name ?? null,
      serviceName: li.service_name ?? null,
      estimateDesc: li.estimate_desc ?? null,
      qty: li.qty ?? 1,
      unitType: li.unit_type ?? null,
      rateCents: li.rate_cents ?? 0,
      visits: li.visits ?? 1,
      totalCents: li.total_cents ?? 0,
      tier: li.tier ?? null,
    }));

  // Customer-facing photos — download and base64-embed since storage signed
  // URLs expire before the attachment would ever be opened.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: photoRows } = await (supabase as any)
    .from("estimate_photos")
    .select("storage_path, caption, created_at")
    .eq("estimate_id", estimateId)
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
      // Skip a photo that failed to download rather than failing the whole send
    }
  }

  const addr = (org?.address as Record<string, string>) ?? {};
  const customizations = (org?.customizations as Record<string, unknown>) ?? {};

  const estimatePdfData: EstimatePDFData = {
    estimateNumber: est.estimate_number as number,
    description: est.description as string | null,
    createdAt: est.created_at as string,
    validUntil: est.valid_until as string | null,
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
    lineItems: pdfLineItems,
    photos,
  };

  const orgPdfData: OrgPDFData = {
    name: orgName,
    street: addr.street ?? "",
    city: addr.city ?? "",
    state: addr.state ?? "",
    zip: addr.zip ?? "",
    phone: orgPhone,
    brandColor: (org?.brand_color as string) ?? "#60ab45",
    logoUrl: (customizations.logoDataUrl as string) ?? null,
  };

  let pdfAttachment: { filename: string; content: string } | null = null;
  if (includePdf) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffer = await renderToBuffer(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createElement(EstimateDocument as any, { estimate: estimatePdfData, org: orgPdfData }) as any
      );
      pdfAttachment = {
        filename: `estimate-${est.estimate_number}.pdf`,
        content: Buffer.from(buffer).toString("base64"),
      };
    } catch (err) {
      // Non-fatal — send the email without the attachment rather than blocking
      // the whole send over a PDF rendering issue.
      console.error("[send-estimate] PDF render error:", err);
    }
  }

  // Send via Resend
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { data: sent, error: sendErr } = await resend.emails.send({
    from: FROM,
    to: toEmails,
    subject: resolvedSubject,
    html: resolvedBody,
    ...(body.ccEmails && body.ccEmails.length > 0 ? { cc: body.ccEmails } : {}),
    ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}),
  });

  if (sendErr) {
    console.error("[send-estimate] Resend error:", sendErr);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  // Log the email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("estimate_emails").insert({
    org_id: profile?.org_id,
    estimate_id: estimateId,
    to_email: toEmailsJoined,
    to_name: clientDisplayName || null,
    subject: resolvedSubject,
    body_html: resolvedBody,
    resend_id: sent?.id ?? null,
    email_type: "estimate",
    cc_emails: body.ccEmails ?? [],
  });

  // Move estimate to "sent" — sent_at is set only on the first send, as the
  // anchor timestamp for "no response in N days" automation triggers.
  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("estimates").update({
    stage: "sent",
    updated_at: nowIso,
    ...(est.sent_at ? {} : { sent_at: nowIso }),
  }).eq("id", estimateId);

  // Log activity
  if (est.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("client_activity").insert({
      org_id: profile?.org_id,
      client_id: est.client_id,
      activity_type: "email",
      subject: `Estimate #${est.estimate_number} sent via email`,
      body: `Sent to ${toEmailsJoined}. Subject: ${resolvedSubject}`,
      sent_to: toEmailsJoined,
      ref_id: estimateId,
      ref_table: "estimates",
      resend_message_id: sent?.id ?? null,
      occurred_at: new Date().toISOString(),
      created_by: user.id,
    });
  }

  // ── Enroll client in estimate_sent automation sequences ───────────────────
  try {
    await fireSimpleTrigger(supabase, {
      orgId: est.org_id,
      clientId: est.client_id,
      estimateId,
      triggerType: "estimate_sent",
      matchValues: est.sales_rep_id ? [est.sales_rep_id] : undefined,
    });
  } catch (enrollErr) {
    // best-effort — don't fail the send if enrollment errors
    console.error("[send-estimate] Enrollment error:", enrollErr);
  }

  return NextResponse.json({ ok: true, proposalUrl });
}
