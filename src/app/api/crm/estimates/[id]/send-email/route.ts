import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Resend } from "resend";

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
  };

  if (!body.subject?.trim() || !body.bodyHtml?.trim()) {
    return NextResponse.json({ error: "subject and bodyHtml are required" }, { status: 400 });
  }

  // Fetch estimate + client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: est, error: estErr } = await (supabase as any)
    .from("estimates")
    .select("*, clients(display_name, primary_email, billing_address), profiles!estimates_sales_rep_id_fkey(name)")
    .eq("id", estimateId)
    .single();

  if (estErr || !est) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const clientEmail = est.clients?.primary_email as string | null;
  if (!clientEmail) {
    return NextResponse.json({ error: "Client has no email address on file" }, { status: 422 });
  }

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

  const proposalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/proposal/${shareToken.token}`;

  const clientDisplayName = (est.clients?.display_name as string) ?? "";
  const firstName = clientDisplayName.split(" ")[0] ?? clientDisplayName;
  const lastName = clientDisplayName.split(" ").slice(1).join(" ") ?? "";
  const salesRepName = (est.profiles?.name as string) ?? orgName;
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
  const resolvedBody    = resolveMergeTags(body.bodyHtml, mergeVars);

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
    sent_to_email: clientEmail,
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

  // Send via Resend
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { data: sent, error: sendErr } = await resend.emails.send({
    from: FROM,
    to: clientEmail,
    subject: resolvedSubject,
    html: resolvedBody,
    ...(body.ccEmails && body.ccEmails.length > 0 ? { cc: body.ccEmails } : {}),
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
    to_email: clientEmail,
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

  // Draft line items aren't proposed to the client yet — sending the estimate
  // is the "go live" moment, so bump them to quote (same as Service Autopilot).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("estimate_line_items")
    .update({ status: "quote" })
    .eq("estimate_id", estimateId)
    .eq("status", "draft");

  // Log activity
  if (est.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("client_activity").insert({
      org_id: profile?.org_id,
      client_id: est.client_id,
      activity_type: "estimate",
      subject: `Estimate #${est.estimate_number} sent via email`,
      body: `Sent to ${clientEmail}. Subject: ${resolvedSubject}`,
      ref_id: estimateId,
      ref_table: "estimates",
      occurred_at: new Date().toISOString(),
    });
  }

  // ── Enroll client in estimate_sent automation sequences ───────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: triggers } = await (supabase as any)
      .from("crm_sequence_triggers")
      .select("sequence_id, crm_automation_sequences(is_active, automation_id, crm_automations(is_active, org_id))")
      .eq("trigger_type", "estimate_sent");

    for (const trigger of triggers ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seq = trigger.crm_automation_sequences as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const auto = seq?.crm_automations as any;
      if (!seq?.is_active || !auto?.is_active) continue;
      if (auto?.org_id !== est.org_id) continue;

      // Don't re-enroll if already enrolled and not completed/stopped
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (supabase as any)
        .from("crm_sequence_enrollments")
        .select("id")
        .eq("sequence_id", trigger.sequence_id)
        .eq("estimate_id", estimateId)
        .is("completed_at", null)
        .is("stopped_at", null)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing) continue;

      // Find first event to compute next_fire_at
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: firstEvent } = await (supabase as any)
        .from("crm_sequence_events")
        .select("id, event_type, config, position")
        .eq("sequence_id", trigger.sequence_id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();

      let nextFireAt = new Date().toISOString();
      if (firstEvent?.event_type === "wait") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const days = (firstEvent.config as any)?.days ?? 0;
        const d = new Date();
        d.setDate(d.getDate() + days);
        nextFireAt = d.toISOString();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("crm_sequence_enrollments").insert({
        org_id: est.org_id,
        sequence_id: trigger.sequence_id,
        client_id: est.client_id,
        estimate_id: estimateId,
        enrolled_at: new Date().toISOString(),
        next_event_position: firstEvent?.event_type === "wait" ? 1 : 0,
        next_fire_at: nextFireAt,
      });
    }
  } catch (enrollErr) {
    // best-effort — don't fail the send if enrollment errors
    console.error("[send-estimate] Enrollment error:", enrollErr);
  }

  return NextResponse.json({ ok: true, proposalUrl });
}
