import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Resend } from "resend";

const FROM = "Twins Lawn Service <noreply@twinslawnservice.com>";

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

  // Send via Resend
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { data: sent, error: sendErr } = await resend.emails.send({
    from: FROM,
    to: clientEmail,
    subject: resolvedSubject,
    html: resolvedBody,
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
  });

  // Move estimate to "sent"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("estimates").update({ stage: "sent", updated_at: new Date().toISOString() }).eq("id", estimateId);

  // Log activity
  if (est.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("client_activity").insert({
      org_id: profile?.org_id,
      client_id: est.client_id,
      activity_type: "estimate_sent",
      subject: `Estimate #${est.estimate_number} sent via email`,
      body: `Sent to ${clientEmail}. Subject: ${resolvedSubject}`,
      related_estimate_id: estimateId,
      occurred_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true, proposalUrl });
}
