import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Resend } from "resend";
import { getOrgReplyTo } from "@/lib/email/reply-to";
import { buildCanSpamFooter, buildClientMergeVars, orgEmailFrom, mapSendError } from "@/lib/email/send";
import { MERGE_CLIENT_COLUMNS, MERGE_PROPERTY_COLUMNS, clientMergeInput, employeeName, orgMergeInput } from "@/lib/email/merge-inputs";
import { resolveMergeTags, resolveSubjectMergeTags } from "@/lib/utils/document-template-renderer";
import { escapeHtml } from "@/lib/utils/escape-html";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { DEFAULT_TIME_ZONE } from "@/lib/time/zone";
import { renderChemicalNoticePdf } from "@/lib/chemical/notice-pdf";
import { loadChemicalNoticeData, loadInvoiceTemplateBranding, noticeOrgFromRow, renderChemicalNoticeHtml } from "@/lib/chemical/application-notice";

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

  // Granular per-role permission — admins always pass, otherwise gated by
  // crm_roles.permissions.chem_send_application_notice. A chemical application notice is a
  // regulatory-facing record of what was applied at a property.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allowed } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "chem_send_application_notice",
  });
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    subject: string;
    bodyHtml: string;
    ccEmails?: string[];
    /** Which of the three chemical emails this is; defaults to the post-application Client Instruction. */
    kind?: "chemical" | "chemical_recommendation" | "chemical_upsell";
    /** Attach the Notice of Treatment PDF (Client Instruction only); defaults to true. */
    attachPdf?: boolean;
    /** Send a Client Instruction even though one was already emailed for this visit. */
    resend?: boolean;
  };
  const kind = body.kind ?? "chemical";
  if (kind !== "chemical" && kind !== "chemical_recommendation" && kind !== "chemical_upsell") {
    return NextResponse.json({ error: "Unknown email type" }, { status: 400 });
  }
  const kindLabel = kind === "chemical_recommendation" ? "Recommendation" : kind === "chemical_upsell" ? "Upsale" : "Chemical Application Notice";
  // The Upsale pitches a service the client hasn't bought — commercial mail, so it honours
  // the marketing opt-outs and carries the unsubscribe footer, like a bulk marketing send.
  // The Client Instruction is a regulatory record and the Recommendation is about work
  // already done at the property; both stay exempt.
  const isMarketing = kind === "chemical_upsell";

  if (!body.subject?.trim() || !body.bodyHtml?.trim()) {
    return NextResponse.json({ error: "subject and bodyHtml are required" }, { status: 400 });
  }

  // Fetch visit + client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit, error: visitErr } = await (supabase as any)
    .from("crm_job_visits")
    .select(
      `id, client_id, scheduled_date, clients(${MERGE_CLIENT_COLUMNS}, email_bounced_at, do_not_market, ok_to_email, unsubscribe_token, ` +
      "sales_rep:crm_employees!clients_sales_rep_id_fkey(first_name,last_name)), " +
      `crm_jobs!crm_job_visits_job_id_fkey(property:client_properties!crm_jobs_property_id_fkey(${MERGE_PROPERTY_COLUMNS}))`,
    )
    .eq("id", visitId)
    .single();

  if (visitErr || !visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const clientEmail = visit.clients?.primary_email as string | null;
  if (!clientEmail) {
    return NextResponse.json({ error: "Client has no email address on file" }, { status: 422 });
  }
  // A hard bounce means the address doesn't accept mail; re-sending damages
  // sending-domain reputation. This route only mails the primary address, and
  // email_bounced_at is derived to mean exactly "the primary has a live
  // bounce" (20261220000500_email_address_bounces.sql).
  if (visit.clients?.email_bounced_at) {
    return NextResponse.json({ error: "Client's email address has hard-bounced. Update it, or send to a different address." }, { status: 422 });
  }
  if (isMarketing && visit.clients?.ok_to_email === false) {
    return NextResponse.json({ error: "Client is marked Not OK to Email" }, { status: 422 });
  }
  if (isMarketing && visit.clients?.do_not_market) {
    return NextResponse.json({ error: "Client has opted out of marketing email" }, { status: 422 });
  }
  // A bulk run re-sent to everyone already emailed when "Send N more" was clicked before
  // the eligibility refetch landed. A repeat Client Instruction now has to be asked for.
  if (kind === "chemical" && !body.resend) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prior } = await (supabase as any)
      .from("crm_chemical_application_emails")
      .select("id")
      .eq("visit_id", visitId)
      .eq("email_type", "chemical_application")
      .limit(1);
    if (prior && prior.length > 0) {
      return NextResponse.json({ error: "A notice was already emailed for this visit" }, { status: 409 });
    }
  }

  // Fetch org
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  const effOrgId = (await getEffectiveOrgId(supabase)) ?? profile?.org_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = effOrgId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase as any).from("organizations").select("name, address, customizations, brand_color").eq("id", effOrgId).single()
    : { data: null };

  const orgName = org?.name ?? "Your Service Provider";
  const orgPhone = ((org?.address as Record<string, string>) ?? {}).phone ?? "";

  // Fetch all chemical applications logged for this visit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: applications, error: appsErr } = await (supabase as any)
    .from("crm_chemical_applications")
    .select(
      "chemical_amount, solution_amount, epa_number_snapshot, re_entry_interval_snapshot, applicator_license_number, temperature, wind_speed, wind_direction, application_start_time, application_end_time, used, preloaded, confirmed_at, product:product_id(name, epa_registration_number, re_entry_interval, route_sheet_instructions), unit:unit_of_measure_id(name), applicator:applicator_employee_id(first_name, last_name)"
    )
    .eq("visit_id", visitId)
    .is("deleted_at", null);

  if (appsErr) {
    return NextResponse.json({ error: "Failed to load chemical applications" }, { status: 500 });
  }
  // Only what was actually applied: a preloaded row is the PLANNED amount until the crew
  // confirms it — the same rule as the compliance report and the invoice lines. The notice
  // could otherwise go out before the visit, listing planned chemicals as applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applied = ((applications ?? []) as any[]).filter((a) => a.used && (!a.preloaded || a.confirmed_at));
  // Only the post-application notice needs a confirmed application; a recommendation or
  // upsale can go out whenever the office wants.
  if (kind === "chemical" && applied.length === 0) {
    return NextResponse.json({ error: "No confirmed chemical applications for this visit yet" }, { status: 422 });
  }

  const clientDisplayName = (visit.clients?.display_name as string) ?? "";
  // The day it was actually applied (in the company's timezone), not the day it was scheduled.
  const first = applied.find((a) => a.application_start_time) ?? applied[0] ?? {};
  const orgTz = effOrgId ? await getOrgTimeZone(supabase, effOrgId) : undefined;
  const applicationDate = first.application_start_time
    ? new Date(first.application_start_time).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric", ...(orgTz ? { timeZone: orgTz } : {}),
      })
    : visit.scheduled_date
      ? new Date(`${visit.scheduled_date}T00:00:00`).toLocaleDateString("en-US", {
          month: "long", day: "numeric", year: "numeric",
        })
      : "";

  const applicatorName = first.applicator
    ? `${first.applicator.first_name ?? ""} ${first.applicator.last_name ?? ""}`.trim()
    : "";
  const applicatorLicense = first.applicator_license_number ?? "";
  const conditionsParts: string[] = [];
  if (first.temperature != null) conditionsParts.push(`${first.temperature}°F`);
  if (first.wind_speed != null) conditionsParts.push(`Wind ${first.wind_speed} mph${first.wind_direction ? ` ${first.wind_direction}` : ""}`);
  const conditions = conditionsParts.join(", ") || "Not recorded";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productsHtml = applied
    .map((a) => {
      // Prefer the snapshot frozen at time-of-application over the live
      // catalog join — a correction to the product's EPA # in the catalog
      // later must not rewrite what this client notice said was actually
      // applied to their property.
      const epa = a.epa_number_snapshot ?? a.product?.epa_registration_number;
      const amount = a.chemical_amount != null ? `${a.chemical_amount} ${a.unit?.name ?? ""}`.trim() : "";
      // Re-entry is what the client actually has to act on — same snapshot rule as the EPA #.
      const reEntry = a.re_entry_interval_snapshot ?? a.product?.re_entry_interval;
      // These are org-authored free text going into a client email as trusted HTML.
      return `<li>${escapeHtml(String(a.product?.name ?? "Chemical"))}${amount ? ` — ${escapeHtml(amount)}` : ""}${epa ? ` (EPA #${escapeHtml(String(epa))})` : ""}${reEntry ? ` — re-entry: ${escapeHtml(String(reEntry))}` : ""}</li>`;
    })
    .join("");
  const products = `<ul>${productsHtml}</ul>`;

  const careInstructions = [
    ...new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applied
        .map((a) => a.product?.route_sheet_instructions)
        .filter((s): s is string => !!s?.trim())
    ),
  ].map((s) => escapeHtml(s).replace(/\n/g, "<br>")).join("<br><br>") || "Keep children and pets off the treated area until dry.";

  // The full leave-behind: compact HTML for the email body, plus a roomy PDF copy
  // attached for the client to keep or print.
  let chemicalNotice = "";
  let pdfAttachment: { filename: string; content: string } | null = null;
  if (effOrgId) {
    const notice = (await loadChemicalNoticeData(supabase, [visitId], "applied", effOrgId)).get(visitId);
    if (notice) {
      const noticeOrg = { ...noticeOrgFromRow(org), ...(await loadInvoiceTemplateBranding(supabase, effOrgId)) };
      const timeZone = await getOrgTimeZone(supabase, effOrgId);
      chemicalNotice = renderChemicalNoticeHtml(notice, noticeOrg, { timeZone, compact: true });
      if (kind === "chemical" && body.attachPdf !== false) {
        try {
          const buffer = await renderChemicalNoticePdf(notice, noticeOrg, timeZone);
          pdfAttachment = {
            filename: `notice-of-treatment-${notice.serviceDate ?? "visit"}.pdf`,
            content: buffer.toString("base64"),
          };
        } catch (err) {
          // Non-fatal: send the email without the attachment rather than block the send.
          console.error("[send-chemical-notice] PDF render error:", err);
        }
      }
    }
  }

  // The full client/property/company vocabulary (raw — resolveMergeTags escapes),
  // then the chemical tags. Only 11 tags used to be set here, so [clientname],
  // [companyphone], [physicaladdress1] (the treated property) etc. went out blank.
  const mergeVars: Record<string, string> = {
    ...buildClientMergeVars(
      clientMergeInput(visit.clients, {
        property: visit.crm_jobs?.property ?? null,
        salesRepName: employeeName(visit.clients?.sales_rep),
      }),
      orgMergeInput(org, orgTz ?? DEFAULT_TIME_ZONE),
      { escape: false },
    ),
    "[chemicalnotice]":     chemicalNotice,
    "[applicationdate]":    applicationDate,
    "[applicatorname]":     applicatorName,
    "[applicatorlicense]":  applicatorLicense,
    "[products]":           products,
    "[conditions]":         conditions,
    "[careinstructions]":   careInstructions,
  };
  if (!mergeVars["[companyphonenumber]"]) mergeVars["[companyphonenumber]"] = orgPhone;

  const resolvedSubject = resolveSubjectMergeTags(body.subject, mergeVars);
  let resolvedBody      = resolveMergeTags(body.bodyHtml, mergeVars);
  let unsubscribeUrl: string | null = null;
  if (isMarketing && visit.clients?.unsubscribe_token) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://landscapt.com";
    unsubscribeUrl = `${appUrl}/api/crm/unsubscribe/${visit.clients.unsubscribe_token}`;
    resolvedBody += buildCanSpamFooter(orgName, (org?.address as Record<string, string> | null) ?? null, unsubscribeUrl);
  }

  // Send via Resend
  const replyTo = effOrgId ? await getOrgReplyTo(supabase, effOrgId) : null;
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { data: sent, error: sendErr } = await resend.emails.send({
    from: orgEmailFrom(org?.name),
    to: clientEmail,
    subject: resolvedSubject,
    html: resolvedBody,
    ...(replyTo ? { replyTo } : {}),
    ...(body.ccEmails && body.ccEmails.length > 0 ? { cc: body.ccEmails } : {}),
    ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}),
    ...(unsubscribeUrl
      ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
      : {}),
  });

  if (sendErr) {
    console.error("[send-chemical-notice] Resend error:", sendErr);
    const mapped = mapSendError(sendErr, "the notice");
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  // Log the email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("crm_chemical_application_emails").insert({
    org_id: effOrgId,
    visit_id: visitId,
    to_email: clientEmail,
    to_name: clientDisplayName || null,
    subject: resolvedSubject,
    body_html: resolvedBody,
    resend_id: sent?.id ?? null,
    email_type: kind === "chemical" ? "chemical_application" : kind,
  });

  // Log activity
  if (visit.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("client_activity").insert({
      org_id: effOrgId,
      client_id: visit.client_id,
      activity_type: "email",
      subject: `${kindLabel} sent via email`,
      body: `Sent to ${clientEmail}. Subject: ${resolvedSubject}`,
      ref_id: visitId,
      ref_table: "crm_job_visits",
      sent_to: clientEmail,
      occurred_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true });
}
