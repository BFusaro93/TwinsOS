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
  // "Email Selected Clients") rather than a 1:1 reply.
  //
  // `purpose` splits that blast in two, because the two kinds are governed
  // differently:
  //
  //   "marketing" (default) — commercial mail. Honours Do Not Market and
  //     carries a CAN-SPAM footer with a working unsubscribe link, exactly as
  //     the campaign sender does.
  //   "service" — a notice about work the customer has already contracted
  //     ("we'll be at your property tomorrow 9-11"). CAN-SPAM governs
  //     commercial messages; transactional/relationship mail is exempt, so a
  //     marketing opt-out does not bar it — and bolting an unsubscribe footer
  //     onto it only invites the customer to unsubscribe from their own
  //     service. No footer, and do_not_market is not consulted.
  //
  // The default is deliberately the restrictive one: a caller has to ask for
  // the permissive path, and this is enforced here rather than trusted from
  // the client.
  const body = await req.json() as {
    subject?: string;
    bodyHtml?: string;
    bulk?: boolean;
    purpose?: "marketing" | "service";
  };
  if (!body.subject?.trim() || !body.bodyHtml?.trim()) {
    return NextResponse.json({ error: "subject and bodyHtml are required" }, { status: 400 });
  }
  const isBulk = body.bulk === true;
  const purpose = body.purpose === "service" ? "service" : "marketing";
  const isMarketing = isBulk && purpose === "marketing";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client } = await (supabase as any)
    .from("clients")
    .select(`
      id, display_name, first_name, last_name, primary_email, phones,
      account_number, invoice_delivery, balance_outstanding_cents,
      billing_address, billing_city, billing_state, billing_zip,
      service_address, service_city, service_state, service_zip,
      turf_sqft, gross_sqft, mulch_bed_sqft, yards_of_mulch,
      linear_ft_perimeter, linear_ft_edging, gate_lock_code, notes_to_crew,
      referred_by, do_not_market, email_bounced_at, unsubscribe_token,
      sales_rep:crm_employees!clients_sales_rep_id_fkey(first_name,last_name),
      referring_client:referred_by_client_id(display_name)
    `)
    .eq("id", clientId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.primary_email) {
    return NextResponse.json({ error: "Client has no email address on file" }, { status: 422 });
  }
  // A hard bounce blocks BOTH purposes: it isn't a preference, it's an address
  // that doesn't accept mail, and re-sending damages sending-domain
  // reputation. This is what makes the "service" override safe to offer.
  if (isBulk && client.email_bounced_at) {
    return NextResponse.json(
      { error: "Client's email address has hard-bounced" },
      { status: 422 }
    );
  }
  if (isMarketing && client.do_not_market) {
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

  const salesRep = client.sales_rep as { first_name: string; last_name: string } | null;
  const referringClient = client.referring_client as { display_name: string } | null;

  const clientForMerge = {
    displayName: client.display_name,
    firstName: client.first_name,
    lastName: client.last_name,
    balanceOutstandingCents: client.balance_outstanding_cents,
    primaryEmail: client.primary_email,
    phones: client.phones,
    accountNumber: client.account_number,
    invoiceDelivery: client.invoice_delivery,
    billingAddress: client.billing_address,
    billingCity: client.billing_city,
    billingState: client.billing_state,
    billingZip: client.billing_zip,
    serviceAddress: client.service_address,
    serviceCity: client.service_city,
    serviceState: client.service_state,
    serviceZip: client.service_zip,
    turfSqft: client.turf_sqft,
    grossSqft: client.gross_sqft,
    mulchBedSqft: client.mulch_bed_sqft,
    yardsOfMulch: client.yards_of_mulch,
    linearFtPerimeter: client.linear_ft_perimeter,
    linearFtEdging: client.linear_ft_edging,
    gateLockCode: client.gate_lock_code,
    notesToCrew: client.notes_to_crew,
    salesRepName: salesRep ? `${salesRep.first_name} ${salesRep.last_name}`.trim() : null,
    referringClientName: referringClient?.display_name ?? client.referred_by ?? null,
  };
  const orgForMerge = {
    name: org?.name ?? null,
    addressPhone: org?.address?.phone ?? null,
    addressStreet: org?.address?.street ?? null,
    addressCity: org?.address?.city ?? null,
    addressState: org?.address?.state ?? null,
    addressZip: org?.address?.zip ?? null,
  };

  // Two separate maps: the subject is plain text delivered verbatim to an
  // inbox, never rendered as HTML, so it must use raw (unescaped) values —
  // reusing the escaped map for both leaked literal "&amp;" into the subject
  // line (e.g. "Smith & Sons"). Same split the campaign sender makes.
  const htmlMergeVars = buildClientMergeVars(clientForMerge, orgForMerge);
  const subjectMergeVars = buildClientMergeVars(clientForMerge, orgForMerge, { escape: false });

  const resolvedSubject = resolveMergeTags(body.subject, subjectMergeVars);
  let resolvedBody = resolveMergeTags(body.bodyHtml, htmlMergeVars);

  // Footer only on commercial mail — see the purpose note above.
  if (isMarketing) {
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
    // Record which rule the send was made under. A service notice may
    // legitimately reach a client who opted out of marketing, so "why did an
    // opted-out client get this?" has to be answerable from the timeline
    // rather than from guesswork.
    body: isBulk
      ? `Sent to ${client.primary_email} (bulk, ${purpose})`
      : `Sent to ${client.primary_email}`,
    sent_to: client.primary_email,
    resend_message_id: resendId,
    occurred_at: new Date().toISOString(),
    created_by: user.id,
  });

  return NextResponse.json({ success: true, resendId });
}
