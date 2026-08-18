import { Resend } from "resend";
import { resolveMergeTags, EMAIL_FROM } from "@/lib/email/send";
import { notifyStaffOfNewTicket } from "@/lib/ticket-notify";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";

/** File-upload answers are stored as `{path, name, size}` objects (see
 *  FormResponses.tsx) — plain string interpolation of one produces
 *  "[object Object]" in the ticket body, client activity log, and merge-tag
 *  values. Render it as just the filename instead. */
function formatFormFieldValue(value: unknown): string {
  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return String(value);
}

// formData is submitted through the fully anonymous public form endpoint —
// interpolating it unescaped into the notification email's HTML body let a
// crafted field value inject markup (link/button spoofing, layout
// injection) into the staff-facing email.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
    .select("id, label, mapped_field, field_type")
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
  // Tries progressively weaker signals until one comes back unambiguous
  // (exactly one candidate client): email first — checked against
  // client_contacts.email AND clients.primary_email AND clients.billing_email,
  // since billing_email is frequently left blank while primary_email is the
  // field that's actually populated — then (unless the form is configured for
  // strict email-only matching) phone, then name as a last resort. A match is
  // only accepted when it resolves to exactly one client; an ambiguous result
  // (e.g. two clients named "John Smith") is treated as "no match" rather than
  // guessing and misattaching the submission.
  let relatedClientId: string | null = null;
  let result = "On Hold";

  // Escapes ILIKE wildcard characters so a submitted name containing "%" or
  // "_" can't turn into an unintended broad/match-everything pattern.
  function escapeIlike(value: string): string {
    return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
  }

  function normalizePhoneDigits(value: string): string {
    return value.replace(/\D/g, "");
  }

  /** Email matching must be case-insensitive (Postgres `=` on text is not) —
   *  also excludes contacts belonging to a soft-deleted client, which the
   *  plain client_contacts lookup used to miss entirely. */
  async function uniqueClientIdByContactEmail(value: string): Promise<string | null> {
    const { data } = await db
      .from("client_contacts")
      .select("client_id, clients!inner(deleted_at)")
      .eq("org_id", form.org_id)
      .ilike("email", escapeIlike(value))
      .is("deleted_at", null)
      .is("clients.deleted_at", null)
      .limit(2);
    const ids = [...new Set((data ?? []).map((c: { client_id: string }) => c.client_id))] as string[];
    return ids.length === 1 ? ids[0] : null;
  }

  /** Merges two column-equality lookups on `clients` without relying on a
   *  hand-built `.or()` filter string (which a value containing "," or ")"
   *  could otherwise break or subtly mis-scope). Case-insensitive. */
  async function uniqueClientIdByEitherEmailColumn(
    columnA: string,
    columnB: string,
    value: string
  ): Promise<string | null> {
    const pattern = escapeIlike(value);
    const [{ data: aRows }, { data: bRows }] = await Promise.all([
      db.from("clients").select("id").eq("org_id", form.org_id).is("deleted_at", null).ilike(columnA, pattern).limit(2),
      db.from("clients").select("id").eq("org_id", form.org_id).is("deleted_at", null).ilike(columnB, pattern).limit(2),
    ]);
    const ids = [...new Set([...(aRows ?? []), ...(bRows ?? [])].map((c: { id: string }) => c.id))] as string[];
    return ids.length === 1 ? ids[0] : null;
  }

  /** Phone numbers are stored with whatever punctuation the source used
   *  ("555-123-4567" vs "(555) 123-4567" vs "5551234567") — compares on
   *  digits only rather than requiring an exact string match. Scoped to the
   *  org so the candidate set stays small. */
  async function uniqueClientIdByPhoneDigits(value: string): Promise<string | null> {
    const targetDigits = normalizePhoneDigits(value);
    if (!targetDigits) return null;

    const [{ data: contactRows }, { data: clientRows }] = await Promise.all([
      db.from("client_contacts").select("client_id, phone, clients!inner(deleted_at)").eq("org_id", form.org_id).is("deleted_at", null).is("clients.deleted_at", null).not("phone", "is", null),
      db.from("clients").select("id, primary_phone").eq("org_id", form.org_id).is("deleted_at", null).not("primary_phone", "is", null),
    ]);
    const ids = new Set<string>();
    for (const row of (contactRows ?? []) as { client_id: string; phone: string | null }[]) {
      if (row.phone && normalizePhoneDigits(row.phone) === targetDigits) ids.add(row.client_id);
    }
    for (const row of (clientRows ?? []) as { id: string; primary_phone: string | null }[]) {
      if (row.primary_phone && normalizePhoneDigits(row.primary_phone) === targetDigits) ids.add(row.id);
    }
    return ids.size === 1 ? [...ids][0] : null;
  }

  /** For match strategies stricter than plain email, a signal isn't enough
   *  on its own — the candidate client must also carry a matching name (or
   *  company, for the strictest strategy). Checked against every contact on
   *  the client plus the client's own display name, since a submitted name
   *  might match either. Conservative: no name/company to check against
   *  means the corroboration fails rather than passing by default. */
  async function clientCorroboratedByNameOrCompany(
    clientId: string,
    firstName: string | null,
    lastName: string | null,
    company: string | null
  ): Promise<boolean> {
    if (!firstName && !lastName && !company) return false;

    const { data: client } = await db
      .from("clients")
      .select("display_name")
      .eq("id", clientId)
      .maybeSingle();
    const displayName: string = (client?.display_name ?? "").toLowerCase();

    if (company && displayName.includes(company.toLowerCase())) return true;

    if (firstName || lastName) {
      if (
        (firstName && displayName.includes(firstName.toLowerCase())) ||
        (lastName && displayName.includes(lastName.toLowerCase()))
      ) {
        return true;
      }
      const { data: contacts } = await db
        .from("client_contacts")
        .select("first_name, last_name")
        .eq("client_id", clientId)
        .is("deleted_at", null);
      for (const c of (contacts ?? []) as { first_name: string | null; last_name: string | null }[]) {
        const cFirst = (c.first_name ?? "").toLowerCase();
        const cLast = (c.last_name ?? "").toLowerCase();
        if ((firstName && cFirst === firstName.toLowerCase()) || (lastName && cLast === lastName.toLowerCase())) {
          return true;
        }
      }
    }
    return false;
  }

  // "email" = email is the only signal consulted, full stop. Every other
  // strategy (name_and_email, name_email_and_company, custom) requires email
  // to be corroborated by a matching name/company — matching on phone or
  // name ALONE, with no email at all, used to be treated as sufficient for
  // any non-"email" strategy, which is how a common name like "John Smith"
  // could get a stranger's submission attached to an existing client.
  let emailClientId: string | null = null;
  if (submittedEmail) {
    emailClientId = await uniqueClientIdByContactEmail(submittedEmail);
    if (!emailClientId) {
      emailClientId = await uniqueClientIdByEitherEmailColumn("primary_email", "billing_email", submittedEmail);
    }
  }

  if (matchStrategy === "email") {
    relatedClientId = emailClientId;
  } else {
    const requireCompany = matchStrategy === "name_email_and_company";
    if (
      emailClientId &&
      (await clientCorroboratedByNameOrCompany(
        emailClientId,
        submittedFirstName,
        submittedLastName,
        requireCompany ? mappedCompany : null
      ))
    ) {
      relatedClientId = emailClientId;
    } else if (submittedPhone) {
      const phoneClientId = await uniqueClientIdByPhoneDigits(submittedPhone);
      if (
        phoneClientId &&
        (await clientCorroboratedByNameOrCompany(
          phoneClientId,
          submittedFirstName,
          submittedLastName,
          requireCompany ? mappedCompany : null
        ))
      ) {
        relatedClientId = phoneClientId;
      }
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
        if (mappedData["client.source"]) clientPatch.source = mappedData["client.source"];
      } else {
        const { data: existing } = await db
          .from("clients")
          .select("billing_email, primary_phone, billing_address, billing_city, billing_state, billing_zip, source")
          .eq("id", relatedClientId)
          .single();
        if (!existing?.billing_email && mappedData["client.email"]) clientPatch.billing_email = mappedData["client.email"];
        if (!existing?.primary_phone && mappedData["client.phone"]) clientPatch.primary_phone = mappedData["client.phone"];
        if (!existing?.billing_address && mappedData["client.address_line1"]) clientPatch.billing_address = mappedData["client.address_line1"];
        if (!existing?.billing_city && mappedData["client.city"]) clientPatch.billing_city = mappedData["client.city"];
        if (!existing?.billing_state && mappedData["client.state"]) clientPatch.billing_state = mappedData["client.state"];
        if (!existing?.billing_zip && mappedData["client.zip"]) clientPatch.billing_zip = mappedData["client.zip"];
        if (!existing?.source && mappedData["client.source"]) clientPatch.source = mappedData["client.source"];
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
          source: mappedData["client.source"] ?? "form",
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

  // ── SMS opt-in consent capture ────────────────────────────────────────────────
  // A checked sms_optin field is affirmative, TCPA-required consent — only ever
  // sets consent true, never clears it (an unchecked/absent box just means this
  // particular form didn't ask, not that the client revoked prior consent).
  if (relatedClientId && formFields) {
    const optInField = formFields.find((f: { field_type?: string }) => f.field_type === "sms_optin");
    if (optInField && formData[optInField.label] === "true") {
      await db
        .from("clients")
        .update({
          sms_opt_in: true,
          sms_opt_in_at: new Date().toISOString(),
          sms_opt_in_source: "form",
        })
        .eq("id", relatedClientId);
    }
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
      body: Object.entries(formData).map(([k, v]) => `${k}: ${formatFormFieldValue(v)}`).join("\n"),
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
      Object.entries(formData).map(([k, v]) => `${k}: ${formatFormFieldValue(v)}`).join("\n"),
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
      vars[`[${label.toLowerCase().replace(/[^a-z0-9]/g, "")}]`] = formatFormFieldValue(value);
    }
    // Escaped counterpart used only for the HTML body/copy block below —
    // `vars` itself stays raw for the plain-text subject line.
    const htmlVars: Record<string, string> = Object.fromEntries(
      Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)])
    );

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
        ? `<hr style="margin:16px 0;border:none;border-top:1px solid #e2e8f0"><p style="font-size:12px;color:#64748b">${Object.entries(formData).map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(formatFormFieldValue(v))}`).join("<br>")}</p>`
        : "";
      const html = resolveMergeTags(notif.body || "", htmlVars).replace(/\n/g, "<br>") + copyBlock;
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
