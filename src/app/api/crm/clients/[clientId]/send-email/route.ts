import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildCanSpamFooter,
  buildClientMergeVars,
  resolveMergeTags,
  sendClientEmail,
} from "@/lib/email/send";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await params;
  // `bulk` marks a one-to-many blast (the dispatch board / waiting list's
  // "Email Selected Clients"), which is commercial mail rather than a 1:1
  // reply. Those must honour Do Not Market and carry a CAN-SPAM footer with a
  // working unsubscribe link, exactly as the campaign sender does.
  const body = await req.json() as { subject?: string; bodyHtml?: string; bulk?: boolean };
  if (!body.subject?.trim() || !body.bodyHtml?.trim()) {
    return NextResponse.json({ error: "subject and bodyHtml are required" }, { status: 400 });
  }
  const isBulk = body.bulk === true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client } = await (supabase as any)
    .from("clients")
    .select("id, display_name, primary_email, balance_outstanding_cents, do_not_market, unsubscribe_token")
    .eq("id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.primary_email) {
    return NextResponse.json({ error: "Client has no email address on file" }, { status: 422 });
  }
  if (isBulk && client.do_not_market) {
    return NextResponse.json(
      { error: "Client has opted out of marketing email" },
      { status: 422 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("name, address")
    .eq("id", profile.org_id)
    .single();

  const clientForMerge = {
    displayName: client.display_name,
    balanceOutstandingCents: client.balance_outstanding_cents,
  };
  const orgForMerge = { name: org?.name ?? null, addressPhone: org?.address?.phone ?? null };

  // Two separate maps: the subject is plain text delivered verbatim to an
  // inbox, never rendered as HTML, so it must use raw (unescaped) values —
  // reusing the escaped map for both leaked literal "&amp;" into the subject
  // line (e.g. "Smith & Sons"). Same split the campaign sender makes.
  const htmlMergeVars = buildClientMergeVars(clientForMerge, orgForMerge);
  const subjectMergeVars = buildClientMergeVars(clientForMerge, orgForMerge, { escape: false });

  const resolvedSubject = resolveMergeTags(body.subject, subjectMergeVars);
  let resolvedBody = resolveMergeTags(body.bodyHtml, htmlMergeVars);

  if (isBulk) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://landscapt.com";
    const unsubscribeUrl = `${appUrl}/api/crm/unsubscribe/${client.unsubscribe_token}`;
    resolvedBody += buildCanSpamFooter(
      org?.name ?? "Your Service Provider",
      org?.address ?? null,
      unsubscribeUrl
    );
  }

  let resendId: string | null = null;
  try {
    const sent = await sendClientEmail({
      to: client.primary_email,
      subject: resolvedSubject,
      html: resolvedBody,
    });
    resendId = sent.resendId;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send email" },
      { status: 500 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("client_activity").insert({
    org_id: profile.org_id,
    client_id: clientId,
    activity_type: "email",
    subject: resolvedSubject,
    body: `Sent to ${client.primary_email}`,
    sent_to: client.primary_email,
    resend_message_id: resendId,
    occurred_at: new Date().toISOString(),
    created_by: user.id,
  });

  return NextResponse.json({ success: true, resendId });
}
