import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildClientMergeVars, resolveMergeTags, sendClientEmail } from "@/lib/email/send";

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
  const body = await req.json() as { subject?: string; bodyHtml?: string };
  if (!body.subject?.trim() || !body.bodyHtml?.trim()) {
    return NextResponse.json({ error: "subject and bodyHtml are required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client } = await (supabase as any)
    .from("clients")
    .select("id, display_name, primary_email, balance_outstanding_cents")
    .eq("id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.primary_email) {
    return NextResponse.json({ error: "Client has no email address on file" }, { status: 422 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("name, address")
    .eq("id", profile.org_id)
    .single();

  const mergeVars = buildClientMergeVars(
    { displayName: client.display_name, balanceOutstandingCents: client.balance_outstanding_cents },
    { name: org?.name ?? null, addressPhone: org?.address?.phone ?? null }
  );

  const resolvedSubject = resolveMergeTags(body.subject, mergeVars);
  const resolvedBody = resolveMergeTags(body.bodyHtml, mergeVars);

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
    occurred_at: new Date().toISOString(),
    created_by: user.id,
  });

  return NextResponse.json({ success: true, resendId });
}
