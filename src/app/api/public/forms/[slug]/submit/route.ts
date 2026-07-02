import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/public/forms/[slug]/submit — anonymous form submission
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Load the form with account management settings
  const { data: form, error: formError } = await db
    .from("crm_forms")
    .select(`
      id, org_id, name, settings,
      auto_manage_accounts, account_matching_strategy, account_update_strategy
    `)
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .single();

  if (formError || !form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  // Load fields with mapped_field values
  const { data: formFields } = await db
    .from("crm_form_fields")
    .select("id, label, mapped_field")
    .eq("form_id", form.id)
    .is("deleted_at", null);

  const body = await req.json();
  const { data: formData = {}, referer } = body;

  // ── Build mapped data from field labels → mapped CRM fields ──────────────────
  // formData is keyed by field label; we need to find each field's mappedField value
  const mappedData: Record<string, string> = {};
  if (formFields) {
    for (const field of formFields) {
      if (!field.mapped_field) continue;
      const value = formData[field.label];
      if (value !== undefined && value !== null && value !== "") {
        mappedData[field.mapped_field] = String(value);
      }
    }
  }

  // Determine form location from referer
  let formLocation = "Website";
  if (referer) {
    try {
      const url = new URL(referer);
      formLocation = url.hostname;
    } catch {
      formLocation = referer;
    }
  }

  // ── Account matching ──────────────────────────────────────────────────────────
  const matchStrategy: string = form.account_matching_strategy ?? "email";
  const autoManage: boolean = form.auto_manage_accounts ?? false;
  const updateStrategy: string = form.account_update_strategy ?? "add_new";

  // Extract key match fields from mapped data
  const mappedEmail = mappedData["client.email"] ?? mappedData["contact.email"] ?? null;
  const mappedFirstName = mappedData["client.first_name"] ?? mappedData["contact.first_name"] ?? null;
  const mappedLastName = mappedData["client.last_name"] ?? mappedData["contact.last_name"] ?? null;
  const mappedPhone = mappedData["client.phone"] ?? mappedData["contact.phone"] ?? null;
  const mappedCompany = mappedData["client.company_name"] ?? null;

  // Fallback to heuristic label scanning if nothing is mapped
  const submittedEmail: string | null =
    mappedEmail ??
    (formData["Email"] as string) ??
    (formData["Email Address"] as string) ??
    null;

  const submittedFirstName: string | null =
    mappedFirstName ??
    (formData["First Name"] as string) ??
    null;

  const submittedLastName: string | null =
    mappedLastName ??
    (formData["Last Name"] as string) ??
    null;

  const submittedName: string | null =
    (submittedFirstName && submittedLastName
      ? `${submittedFirstName} ${submittedLastName}`.trim()
      : submittedFirstName ?? mappedCompany) ??
    (formData["Full Name"] as string) ??
    (formData["Name"] as string) ??
    null;

  const submittedPhone: string | null =
    mappedPhone ??
    (formData["Phone"] as string) ??
    (formData["Phone Number"] as string) ??
    null;

  const submittedMessage: string | null =
    (formData["Message"] as string) ??
    (formData["Description"] as string) ??
    (formData["How can we help?"] as string) ??
    null;

  // ── Find matching client ──────────────────────────────────────────────────────
  let relatedClientId: string | null = null;
  let result = "On Hold";

  if (submittedEmail || (submittedFirstName && submittedLastName)) {
    let matchQuery = db.from("clients").select("id").eq("org_id", form.org_id).is("deleted_at", null);

    if (matchStrategy === "email" && submittedEmail) {
      matchQuery = matchQuery.eq("billing_email", submittedEmail);
    } else if (matchStrategy === "name_and_email" && submittedEmail) {
      // Try contact email first
      const { data: contact } = await db
        .from("client_contacts")
        .select("client_id")
        .eq("org_id", form.org_id)
        .eq("email", submittedEmail)
        .is("deleted_at", null)
        .maybeSingle();
      if (contact?.client_id) relatedClientId = contact.client_id;
      if (!relatedClientId) {
        matchQuery = matchQuery.eq("billing_email", submittedEmail);
      }
    } else if ((matchStrategy === "name_email_and_company" || matchStrategy === "custom") && submittedEmail) {
      matchQuery = matchQuery.eq("billing_email", submittedEmail);
    }

    if (!relatedClientId) {
      const { data: matched } = await matchQuery.maybeSingle();
      if (matched?.id) relatedClientId = matched.id;
    }
  }

  // ── Auto-manage: create or update client ─────────────────────────────────────
  if (autoManage) {
    if (relatedClientId) {
      // Update existing client
      result = "Account Updated";
      const clientPatch: Record<string, string> = {};

      if (updateStrategy === "replace_all") {
        // Replace all mapped client fields
        if (mappedData["client.email"]) clientPatch.billing_email = mappedData["client.email"];
        if (mappedData["client.phone"]) clientPatch.primary_phone = mappedData["client.phone"];
        if (mappedData["client.company_name"]) clientPatch.display_name = mappedData["client.company_name"];
        if (mappedData["client.address_line1"]) clientPatch.billing_address = mappedData["client.address_line1"];
        if (mappedData["client.city"]) clientPatch.billing_city = mappedData["client.city"];
        if (mappedData["client.state"]) clientPatch.billing_state = mappedData["client.state"];
        if (mappedData["client.zip"]) clientPatch.billing_zip = mappedData["client.zip"];
        if (mappedData["client.notes"]) clientPatch.notes_to_crew = mappedData["client.notes"];
      } else {
        // add_new: only update fields not already set
        const { data: existing } = await db
          .from("clients")
          .select("billing_email, primary_phone, billing_address, billing_city, billing_state, billing_zip")
          .eq("id", relatedClientId)
          .single();
        if (!existing?.billing_email && mappedData["client.email"]) clientPatch.billing_email = mappedData["client.email"];
        if (!existing?.primary_phone && mappedData["client.phone"]) clientPatch.primary_phone = mappedData["client.phone"];
        if (!existing?.billing_address && mappedData["client.address_line1"]) clientPatch.billing_address = mappedData["client.address_line1"];
        if (!existing?.billing_city && mappedData["client.city"]) clientPatch.billing_city = mappedData["client.city"];
        if (!existing?.billing_state && mappedData["client.state"]) clientPatch.billing_state = mappedData["client.state"];
        if (!existing?.billing_zip && mappedData["client.zip"]) clientPatch.billing_zip = mappedData["client.zip"];
      }

      if (Object.keys(clientPatch).length > 0) {
        await db.from("clients").update(clientPatch).eq("id", relatedClientId);
      }

      // Update or insert primary contact
      if (mappedFirstName || submittedFirstName) {
        const { data: primaryContact } = await db
          .from("client_contacts")
          .select("id, first_name, last_name, email, phone")
          .eq("client_id", relatedClientId)
          .eq("is_primary", true)
          .maybeSingle();

        const contactPatch: Record<string, string | boolean> = {};
        if (updateStrategy === "replace_all") {
          if (mappedFirstName) contactPatch.first_name = mappedFirstName;
          if (mappedLastName) contactPatch.last_name = mappedLastName;
          if (mappedData["contact.email"] ?? mappedEmail) contactPatch.email = (mappedData["contact.email"] ?? mappedEmail)!;
          if (mappedData["contact.phone"] ?? mappedPhone) contactPatch.phone = (mappedData["contact.phone"] ?? mappedPhone)!;
        } else {
          if (!primaryContact?.first_name && mappedFirstName) contactPatch.first_name = mappedFirstName;
          if (!primaryContact?.last_name && mappedLastName) contactPatch.last_name = mappedLastName;
          if (!primaryContact?.email && (mappedData["contact.email"] ?? mappedEmail)) contactPatch.email = (mappedData["contact.email"] ?? mappedEmail)!;
          if (!primaryContact?.phone && (mappedData["contact.phone"] ?? mappedPhone)) contactPatch.phone = (mappedData["contact.phone"] ?? mappedPhone)!;
        }

        if (primaryContact && Object.keys(contactPatch).length > 0) {
          await db.from("client_contacts").update(contactPatch).eq("id", primaryContact.id);
        } else if (!primaryContact && (mappedFirstName || submittedFirstName)) {
          await db.from("client_contacts").insert({
            org_id: form.org_id,
            client_id: relatedClientId,
            first_name: mappedFirstName ?? submittedFirstName ?? "Unknown",
            last_name: mappedLastName ?? null,
            email: mappedData["contact.email"] ?? mappedEmail ?? null,
            phone: mappedData["contact.phone"] ?? mappedPhone ?? null,
            is_primary: true,
          });
        }
      }
    } else {
      // Create new client
      const displayName =
        mappedCompany ??
        (submittedFirstName && submittedLastName
          ? `${submittedFirstName} ${submittedLastName}`.trim()
          : submittedFirstName ?? submittedName ?? "New Lead");

      const { data: newClient } = await db
        .from("clients")
        .insert({
          org_id: form.org_id,
          display_name: displayName,
          account_type: mappedCompany ? "commercial" : "residential",
          primary_email: submittedEmail ?? null,
          billing_email: mappedData["client.email"] ?? submittedEmail ?? null,
          primary_phone: mappedData["client.phone"] ?? submittedPhone ?? null,
          billing_address: mappedData["client.address_line1"] ?? null,
          billing_city: mappedData["client.city"] ?? null,
          billing_state: mappedData["client.state"] ?? null,
          billing_zip: mappedData["client.zip"] ?? null,
          notes_to_crew: mappedData["client.notes"] ?? null,
          source: "form",
          status: "lead",
        })
        .select("id")
        .single();

      relatedClientId = newClient?.id ?? null;

      if (relatedClientId && (submittedFirstName || submittedEmail)) {
        await db.from("client_contacts").insert({
          org_id: form.org_id,
          client_id: relatedClientId,
          first_name: mappedFirstName ?? submittedFirstName ?? displayName,
          last_name: mappedLastName ?? null,
          email: mappedData["contact.email"] ?? submittedEmail ?? null,
          phone: mappedData["contact.phone"] ?? submittedPhone ?? null,
          is_primary: true,
        });
      }

      result = "Account Created";
    }
  } else {
    // Manual review — mark on_hold
    result = relatedClientId ? "On Hold — Matched" : "On Hold — New";
  }

  // ── Apply Tags on Submit ──────────────────────────────────────────────────────
  const tagsOnSubmit = form.settings?.tagsOnSubmit as { add?: string[]; remove?: string[] } | undefined;
  if (relatedClientId && tagsOnSubmit) {
    if (tagsOnSubmit.add?.length) {
      const tagInserts = tagsOnSubmit.add.map((tag: string) => ({
        org_id: form.org_id,
        client_id: relatedClientId,
        tag,
      }));
      // upsert to avoid duplicates
      await db.from("client_tags").upsert(tagInserts, { onConflict: "org_id,client_id,tag", ignoreDuplicates: true });
    }
    if (tagsOnSubmit.remove?.length) {
      for (const tag of tagsOnSubmit.remove) {
        await db.from("client_tags").delete()
          .eq("org_id", form.org_id)
          .eq("client_id", relatedClientId)
          .eq("tag", tag);
      }
    }
  }

  // ── Log activity on client timeline ──────────────────────────────────────────
  if (relatedClientId) {
    await db.from("client_activity").insert({
      org_id: form.org_id,
      client_id: relatedClientId,
      activity_type: "note",
      subject: `Form submitted: ${form.name}`,
      body: Object.entries(formData).map(([k, v]) => `${k}: ${v}`).join("\n"),
    });
  }

  // ── Create ticket ─────────────────────────────────────────────────────────────
  let relatedTicketId: string | null = null;
  {
    const ticketSubject = `${form.name}${submittedName ? ` — ${submittedName}` : ""}`;
    const ticketBody = [
      submittedName ? `Name: ${submittedName}` : null,
      submittedEmail ? `Email: ${submittedEmail}` : null,
      submittedPhone ? `Phone: ${submittedPhone}` : null,
      submittedMessage ? `\nMessage:\n${submittedMessage}` : null,
      "\n--- Full submission ---",
      Object.entries(formData).map(([k, v]) => `${k}: ${v}`).join("\n"),
    ].filter(Boolean).join("\n");

    const { data: ticket } = await supabase
      .from("crm_tickets")
      .insert({
        org_id: form.org_id,
        client_id: relatedClientId ?? undefined,
        subject: ticketSubject,
        body: ticketBody,
        status: "open",
        priority: "normal",
        category: form.name,
        type: "note",
        source: "form",
      })
      .select("id")
      .single();

    relatedTicketId = ticket?.id ?? null;
  }

  // ── Log form response ─────────────────────────────────────────────────────────
  const responseStatus = autoManage ? "completed" : "on_hold";

  const { error: insertError } = await db.from("crm_form_responses").insert({
    form_id: form.id,
    org_id: form.org_id,
    submitted_by_name: submittedName,
    submitted_by_email: submittedEmail,
    data: formData,
    result,
    status: responseStatus,
    related_client_id: relatedClientId,
    related_ticket_id: relatedTicketId,
    form_location: formLocation,
    is_read: false,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // ── TODO: Fire email notifications ────────────────────────────────────────────
  // form.settings.emailNotifications contains notification config.
  // Actual email sending requires Resend/SMTP integration (future sprint).

  return NextResponse.json({ ok: true, result });
}
