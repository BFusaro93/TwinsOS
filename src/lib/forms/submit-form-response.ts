import { Resend } from "resend";
import { resolveMergeTags, EMAIL_FROM } from "@/lib/email/send";
import { notifyStaffOfNewTicket } from "@/lib/ticket-notify";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";

interface FormEmailNotification {
  recipients: string; // comma-separated emails, or "account" for the submitter
  fromName?: string;
  fromEmail?: string;
  subject: string;
  body: string;
  sendCopy?: boolean; // append the full raw submission (all fields) below the body
}

interface FormRow {
  id: string;
  org_id: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: any;
  auto_manage_accounts: boolean | null;
  account_matching_strategy: string | null;
  account_update_strategy: string | null;
}

/**
 * Shared submission logic for a crm_forms response — field-label→mapped-CRM-field
 * resolution, client account matching/auto-create, tag application, ticket
 * creation, and the crm_form_responses insert. Used by both the true public
 * endpoint (org/status resolved by slug, requires status='published') and the
 * internal "Fill Out Form" test dialog (org resolved by session, no published
 * requirement — staff need to test a form before publishing it).
 */
export async function submitFormResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  form: FormRow,
  formData: Record<string, unknown>,
  referer: string | undefined,
  /** Tags computed by evaluating the form's Rules (add_tag/remove_tag actions)
   *  against the submitted answers — merged with the form's own static
   *  settings.tagsOnSubmit configuration below. */
  ruleTags?: { add?: string[]; remove?: string[] }
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  const { data: formFields } = await db
    .from("crm_form_fields")
    .select("id, label, mapped_field")
    .eq("form_id", form.id)
    .is("deleted_at", null);

  // ── Build mapped data from field labels → mapped CRM fields ──────────────────
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

  const mappedEmail = mappedData["client.email"] ?? mappedData["contact.email"] ?? null;
  const mappedFirstName = mappedData["client.first_name"] ?? mappedData["contact.first_name"] ?? null;
  const mappedLastName = mappedData["client.last_name"] ?? mappedData["contact.last_name"] ?? null;
  const mappedPhone = mappedData["client.phone"] ?? mappedData["contact.phone"] ?? null;
  const mappedCompany = mappedData["client.company_name"] ?? null;

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
      result = "Account Updated";
      const clientPatch: Record<string, string> = {};

      if (updateStrategy === "replace_all") {
        if (mappedData["client.email"]) clientPatch.billing_email = mappedData["client.email"];
        if (mappedData["client.phone"]) clientPatch.primary_phone = mappedData["client.phone"];
        if (mappedData["client.company_name"]) clientPatch.display_name = mappedData["client.company_name"];
        if (mappedData["client.address_line1"]) clientPatch.billing_address = mappedData["client.address_line1"];
        if (mappedData["client.city"]) clientPatch.billing_city = mappedData["client.city"];
        if (mappedData["client.state"]) clientPatch.billing_state = mappedData["client.state"];
        if (mappedData["client.zip"]) clientPatch.billing_zip = mappedData["client.zip"];
        if (mappedData["client.notes"]) clientPatch.notes_to_crew = mappedData["client.notes"];
      } else {
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
    result = relatedClientId ? "On Hold — Matched" : "On Hold — New";
  }

  // ── Apply Tags on Submit ──────────────────────────────────────────────────────
  // Union the form's static settings.tagsOnSubmit config with whatever the
  // Rules engine computed from this specific submission's answers.
  const tagsOnSubmit = form.settings?.tagsOnSubmit as { add?: string[]; remove?: string[] } | undefined;
  const tagsToAdd = [...new Set([...(tagsOnSubmit?.add ?? []), ...(ruleTags?.add ?? [])])];
  const tagsToRemove = [...new Set([...(tagsOnSubmit?.remove ?? []), ...(ruleTags?.remove ?? [])])];
  if (relatedClientId && (tagsToAdd.length > 0 || tagsToRemove.length > 0)) {
    if (tagsToAdd.length > 0) {
      const tagInserts = tagsToAdd.map((tag: string) => ({
        org_id: form.org_id,
        client_id: relatedClientId,
        tag,
      }));
      await db.from("client_tags").upsert(tagInserts, { onConflict: "org_id,client_id,tag", ignoreDuplicates: true });
    }
    if (tagsToRemove.length > 0) {
      for (const tag of tagsToRemove) {
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

    const { data: ticket } = await db
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
      .select("id, ticket_number")
      .single();

    relatedTicketId = ticket?.id ?? null;

    if (ticket) {
      await notifyStaffOfNewTicket(db, {
        orgId: form.org_id,
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        subject: ticketSubject,
        assignedToName: null,
        createdByUserId: null,
      });
    }
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
    return { ok: false, error: insertError.message };
  }

  if (relatedClientId) {
    await fireSimpleTrigger(db, { orgId: form.org_id, clientId: relatedClientId, triggerType: "form_submitted" });
  }

  // ── Fire configured email notifications ───────────────────────────────────────
  // Admin-typed fixed recipients for a specific business purpose (not resolved
  // to profiles), so — like automations' send_email action — this sends
  // unconditionally with no notification_prefs gating.
  const emailNotifications = (form.settings?.emailNotifications ?? []) as FormEmailNotification[];
  if (emailNotifications.length > 0 && process.env.RESEND_API_KEY) {
    const { data: org } = await db.from("organizations").select("name, address").eq("id", form.org_id).single();
    const orgName = (org?.name as string | undefined) ?? "Your Service Provider";
    const orgPhone = ((org?.address as Record<string, string> | null)?.phone as string | undefined) ?? "";

    const vars: Record<string, string> = {
      "[formname]": form.name,
      "[submittedname]": submittedName ?? "",
      "[submittedemail]": submittedEmail ?? "",
      "[submittedphone]": submittedPhone ?? "",
      "[submittedmessage]": submittedMessage ?? "",
      "[companyname]": orgName,
      "[companyphone]": orgPhone,
    };
    // Every submitted field is also available by its label, e.g. "How can we
    // help?" → [howcanwehelp] — lets a notification body reference any field
    // on this specific form without the sender needing to know it in advance.
    for (const [label, value] of Object.entries(formData)) {
      vars[`[${label.toLowerCase().replace(/[^a-z0-9]/g, "")}]`] = String(value);
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    for (const notif of emailNotifications) {
      const recipients = (notif.recipients ?? "")
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => (r.toLowerCase() === "account" ? submittedEmail : r))
        .filter((r): r is string => !!r);
      if (!recipients.length) continue;

      const subject = resolveMergeTags(notif.subject || `New submission: ${form.name}`, vars);
      const copyBlock = notif.sendCopy
        ? `<hr style="margin:16px 0;border:none;border-top:1px solid #e2e8f0"><p style="font-size:12px;color:#64748b">${Object.entries(formData).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join("<br>")}</p>`
        : "";
      const html = resolveMergeTags(notif.body || "", vars).replace(/\n/g, "<br>") + copyBlock;
      const from = notif.fromEmail ? `${notif.fromName || orgName} <${notif.fromEmail}>` : EMAIL_FROM;

      for (const to of recipients) {
        await resend.emails.send({ from, to, subject, html }).catch(() => {
          // Non-fatal — one bad recipient/from-domain shouldn't block the others
          // or fail the submission itself.
        });
      }
    }
  }

  return { ok: true, result };
}
