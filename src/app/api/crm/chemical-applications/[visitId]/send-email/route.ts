import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Resend } from "resend";
import { orgEmailFrom } from "@/lib/email/send";

function resolveMergeTags(template: string, vars: Record<string, string>): string {
  return template.replace(/\[(\w+)\]/g, (match) => {
    const key = match.toLowerCase();
    return vars[key] ?? match;
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { visitId } = await params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    subject: string;
    bodyHtml: string;
    ccEmails?: string[];
  };

  if (!body.subject?.trim() || !body.bodyHtml?.trim()) {
    return NextResponse.json({ error: "subject and bodyHtml are required" }, { status: 400 });
  }

  // Fetch visit + client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit, error: visitErr } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, client_id, scheduled_date, clients(display_name, primary_email)")
    .eq("id", visitId)
    .single();

  if (visitErr || !visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const clientEmail = visit.clients?.primary_email as string | null;
  if (!clientEmail) {
    return NextResponse.json({ error: "Client has no email address on file" }, { status: 422 });
  }

  // Fetch org
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = profile?.org_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase as any).from("organizations").select("name, address").eq("id", profile.org_id).single()
    : { data: null };

  const orgName = org?.name ?? "Your Service Provider";
  const orgPhone = ((org?.address as Record<string, string>) ?? {}).phone ?? "";

  // Fetch all chemical applications logged for this visit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: applications, error: appsErr } = await (supabase as any)
    .from("crm_chemical_applications")
    .select(
      "chemical_amount, solution_amount, epa_number_snapshot, applicator_license_number, temperature, wind_speed, wind_direction, application_start_time, application_end_time, used, product:product_id(name, epa_registration_number, route_sheet_instructions), unit:unit_of_measure_id(name), applicator:applicator_employee_id(first_name, last_name)"
    )
    .eq("visit_id", visitId)
    .is("deleted_at", null);

  if (appsErr) {
    return NextResponse.json({ error: "Failed to load chemical applications" }, { status: 500 });
  }
  if (!applications || applications.length === 0) {
    return NextResponse.json({ error: "No chemical applications logged for this visit" }, { status: 422 });
  }

  const clientDisplayName = (visit.clients?.display_name as string) ?? "";
  const firstName = clientDisplayName.split(" ")[0] ?? clientDisplayName;
  const applicationDate = visit.scheduled_date
    ? new Date(`${visit.scheduled_date}T00:00:00`).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      })
    : "";

  const first = applications[0];
  const applicatorName = first.applicator
    ? `${first.applicator.first_name ?? ""} ${first.applicator.last_name ?? ""}`.trim()
    : "";
  const applicatorLicense = first.applicator_license_number ?? "";
  const conditionsParts: string[] = [];
  if (first.temperature != null) conditionsParts.push(`${first.temperature}°F`);
  if (first.wind_speed != null) conditionsParts.push(`Wind ${first.wind_speed} mph${first.wind_direction ? ` ${first.wind_direction}` : ""}`);
  const conditions = conditionsParts.join(", ") || "Not recorded";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productsHtml = (applications as any[])
    .filter((a) => a.used)
    .map((a) => {
      // Prefer the snapshot frozen at time-of-application over the live
      // catalog join — a correction to the product's EPA # in the catalog
      // later must not rewrite what this client notice said was actually
      // applied to their property.
      const epa = a.epa_number_snapshot ?? a.product?.epa_registration_number;
      const amount = a.chemical_amount != null ? `${a.chemical_amount} ${a.unit?.name ?? ""}`.trim() : "";
      return `<li>${a.product?.name ?? "Chemical"}${amount ? ` — ${amount}` : ""}${epa ? ` (EPA #${epa})` : ""}</li>`;
    })
    .join("");
  const products = `<ul>${productsHtml}</ul>`;

  const careInstructions = [
    ...new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (applications as any[])
        .map((a) => a.product?.route_sheet_instructions)
        .filter((s): s is string => !!s?.trim())
    ),
  ].join("<br><br>") || "Keep children and pets off the treated area until dry.";

  const mergeVars: Record<string, string> = {
    "[clientfirstname]":    firstName,
    "[clientfullname]":     clientDisplayName,
    "[companyname]":        orgName,
    "[applicationdate]":    applicationDate,
    "[applicatorname]":     applicatorName,
    "[applicatorlicense]":  applicatorLicense,
    "[products]":           products,
    "[conditions]":         conditions,
    "[careinstructions]":   careInstructions,
    "[companyphonenumber]": orgPhone,
  };

  const resolvedSubject = resolveMergeTags(body.subject, mergeVars);
  const resolvedBody    = resolveMergeTags(body.bodyHtml, mergeVars);

  // Send via Resend
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { data: sent, error: sendErr } = await resend.emails.send({
    from: orgEmailFrom(org?.name),
    to: clientEmail,
    subject: resolvedSubject,
    html: resolvedBody,
    ...(body.ccEmails && body.ccEmails.length > 0 ? { cc: body.ccEmails } : {}),
  });

  if (sendErr) {
    console.error("[send-chemical-notice] Resend error:", sendErr);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  // Log the email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("crm_chemical_application_emails").insert({
    org_id: profile?.org_id,
    visit_id: visitId,
    to_email: clientEmail,
    to_name: clientDisplayName || null,
    subject: resolvedSubject,
    body_html: resolvedBody,
    resend_id: sent?.id ?? null,
    email_type: "chemical_application",
  });

  // Log activity
  if (visit.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("client_activity").insert({
      org_id: profile?.org_id,
      client_id: visit.client_id,
      activity_type: "email",
      subject: "Chemical Application Notice sent via email",
      body: `Sent to ${clientEmail}. Subject: ${resolvedSubject}`,
      ref_id: visitId,
      ref_table: "crm_job_visits",
      sent_to: clientEmail,
      occurred_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true });
}
