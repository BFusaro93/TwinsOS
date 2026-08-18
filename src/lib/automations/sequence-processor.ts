import { resolveEmailStepContent, sendResolvedSequenceEmail, advanceEnrollmentPastStep } from "./sequence-email";
import { resolveSmsStepContent, sendResolvedSequenceSms } from "./sequence-sms";
import { notifyStaffOfNewTicket, notifyTicketAssigned } from "@/lib/ticket-notify";
import { shouldStopSequence, logSequenceExecution } from "./sequence-enrollment";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface DueEnrollmentRow {
  id: string;
  org_id: string;
  sequence_id: string;
  client_id: string | null;
  estimate_id: string | null;
  ticket_id: string | null;
  invoice_id: string | null;
  next_event_position: number;
}

export type ProcessOutcome =
  | { fired: { enrollmentId: string; action: string } }
  | { skipped: { enrollmentId: string; reason: string } };

/**
 * Processes exactly one due step for one enrollment: evaluates stop
 * conditions, dispatches on the current event's type (wait/email/text_message/
 * alert/ticket/update/note/tags), and advances (or completes/stops) the
 * enrollment. Shared by the daily cron sweep (`/api/automations/run`) and by
 * the immediate-send path fired right when a client is enrolled — this is the
 * single source of truth for "what happens when a sequence step comes due" so
 * both call sites stay in lockstep.
 */
export async function processDueEnrollment(
  adminClient: AnyClient,
  enrollment: DueEnrollmentRow
): Promise<ProcessOutcome> {
  const nowIso = new Date().toISOString();
  const { id: enrollId, org_id: orgId, sequence_id, client_id, estimate_id, ticket_id, invoice_id, next_event_position } = enrollment;

  const { data: events } = await adminClient
    .from("crm_sequence_events")
    .select("id, event_type, config, position")
    .eq("sequence_id", sequence_id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  const currentEvent = (events ?? []).find((e: { position: number }) => e.position === next_event_position);

  if (!currentEvent) {
    await adminClient
      .from("crm_sequence_enrollments")
      .update({ completed_at: nowIso, updated_at: nowIso })
      .eq("id", enrollId);
    await logSequenceExecution(adminClient, {
      orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id, action: "completed",
    });
    return { fired: { enrollmentId: enrollId, action: "completed" } };
  }

  const stopped = await shouldStopSequence(adminClient, sequence_id, client_id ?? null, estimate_id ?? null, ticket_id ?? null, invoice_id ?? null);
  if (stopped) {
    await adminClient
      .from("crm_sequence_enrollments")
      .update({ stopped_at: nowIso, updated_at: nowIso })
      .eq("id", enrollId);
    await logSequenceExecution(adminClient, {
      orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id, action: "stopped_by_condition",
    });
    return { fired: { enrollmentId: enrollId, action: "stopped by condition" } };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventConfig = (currentEvent.config ?? {}) as Record<string, any>;

  if (currentEvent.event_type === "wait") {
    const nextPos = next_event_position + 1;
    const nextEvent = (events ?? []).find((e: { position: number }) => e.position === nextPos);
    let newFireAt = nowIso;
    if (nextEvent?.event_type === "wait") {
      const waitConfig = (nextEvent.config as Record<string, number>) ?? {};
      const days = waitConfig.days ?? 0;
      const hours = waitConfig.hours ?? 0;
      const d = new Date();
      d.setDate(d.getDate() + days);
      d.setHours(d.getHours() + hours);
      newFireAt = d.toISOString();
    }
    await adminClient
      .from("crm_sequence_enrollments")
      .update({ next_event_position: nextPos, next_fire_at: newFireAt, updated_at: nowIso })
      .eq("id", enrollId);
    await logSequenceExecution(adminClient, {
      orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
      eventId: currentEvent.id, eventType: "wait", action: "wait_advanced",
      detail: `advanced to position ${nextPos}`,
    });
    return { fired: { enrollmentId: enrollId, action: `wait advanced to position ${nextPos}` } };
  }

  if (currentEvent.event_type === "email") {
    // "Send Mon-Fri only" — defer to the next weekday rather than skipping
    // the step outright; the enrollment just gets re-checked then.
    if (eventConfig.send_weekdays_only) {
      const day = new Date().getDay(); // 0 = Sun, 6 = Sat
      if (day === 0 || day === 6) {
        const d = new Date();
        d.setDate(d.getDate() + (day === 0 ? 1 : 2));
        await adminClient
          .from("crm_sequence_enrollments")
          .update({ next_fire_at: d.toISOString(), updated_at: nowIso })
          .eq("id", enrollId);
        return { skipped: { enrollmentId: enrollId, reason: "deferred to next weekday (send_weekdays_only)" } };
      }
    }

    const built = await resolveEmailStepContent(adminClient, {
      orgId,
      clientId: client_id!,
      estimateId: estimate_id ?? null,
      subjectTemplate: eventConfig.subject ?? "",
      bodyTemplate: eventConfig.bodyHtml ?? eventConfig.body ?? "",
      toSelection: eventConfig.to,
      fromSelection: eventConfig.from,
    });
    if ("error" in built) {
      await logSequenceExecution(adminClient, {
        orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
        eventId: currentEvent.id, eventType: "email", action: "email_skipped", detail: built.error,
      });
      return { skipped: { enrollmentId: enrollId, reason: built.error } };
    }

    // "Requires approval" — park the step in the approval queue instead of
    // sending. The processor won't re-visit this enrollment (query filters on
    // awaiting_approval = false) until a human decides.
    if (eventConfig.require_approval) {
      const { error: approvalErr } = await adminClient
        .from("crm_sequence_step_approvals")
        .insert({
          org_id: orgId,
          enrollment_id: enrollId,
          event_id: currentEvent.id,
          sequence_id,
          client_id,
          estimate_id: estimate_id ?? null,
          to_email: built.toEmails.join(", "),
          to_name: built.toName || null,
          subject: built.subject,
          body_html: built.bodyHtml,
        });
      // 23505 = unique_violation on the one-pending-per-enrollment+event
      // index — a concurrent/prior run already queued this approval, which is
      // fine; anything else is a real failure.
      if (approvalErr && approvalErr.code !== "23505") {
        return { skipped: { enrollmentId: enrollId, reason: `failed to create approval: ${approvalErr.message}` } };
      }
      await adminClient
        .from("crm_sequence_enrollments")
        .update({ awaiting_approval: true, updated_at: nowIso })
        .eq("id", enrollId);
      await logSequenceExecution(adminClient, {
        orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
        eventId: currentEvent.id, eventType: "email", action: "awaiting_approval",
        detail: built.subject,
      });
      return { fired: { enrollmentId: enrollId, action: "awaiting approval" } };
    }

    const sendResult = await sendResolvedSequenceEmail(adminClient, {
      orgId,
      clientId: client_id ?? null,
      estimateId: estimate_id ?? null,
      toEmails: built.toEmails,
      toName: built.toName,
      subject: built.subject,
      bodyHtml: built.bodyHtml,
    });
    if (!sendResult.ok) {
      await logSequenceExecution(adminClient, {
        orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
        eventId: currentEvent.id, eventType: "email", action: "email_skipped", detail: sendResult.reason,
      });
      return { skipped: { enrollmentId: enrollId, reason: sendResult.reason } };
    }

    const action = await advanceEnrollmentPastStep(adminClient, {
      enrollmentId: enrollId,
      events: events ?? [],
      completedPosition: next_event_position,
      nowIso,
    });
    await logSequenceExecution(adminClient, {
      orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
      eventId: currentEvent.id, eventType: "email", action: "email_sent",
      detail: `${built.subject} → ${built.toEmails.join(", ")}`,
    });
    return { fired: { enrollmentId: enrollId, action: `email sent → ${action}` } };
  }

  if (currentEvent.event_type === "text_message") {
    const built = await resolveSmsStepContent(adminClient, {
      orgId,
      clientId: client_id!,
      bodyTemplate: eventConfig.message ?? "",
    });
    if ("error" in built) {
      await logSequenceExecution(adminClient, {
        orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
        eventId: currentEvent.id, eventType: "text_message", action: "sms_skipped", detail: built.error,
      });
      return { skipped: { enrollmentId: enrollId, reason: built.error } };
    }

    // "Requires approval" — same park-in-the-queue pattern as email.
    if (eventConfig.require_approval) {
      const { error: approvalErr } = await adminClient
        .from("crm_sequence_step_approvals")
        .insert({
          org_id: orgId,
          enrollment_id: enrollId,
          event_id: currentEvent.id,
          sequence_id,
          client_id,
          estimate_id: estimate_id ?? null,
          channel: "sms",
          to_phone: built.toPhone,
          body_text: built.bodyText,
        });
      if (approvalErr && approvalErr.code !== "23505") {
        return { skipped: { enrollmentId: enrollId, reason: `failed to create approval: ${approvalErr.message}` } };
      }
      await adminClient
        .from("crm_sequence_enrollments")
        .update({ awaiting_approval: true, updated_at: nowIso })
        .eq("id", enrollId);
      await logSequenceExecution(adminClient, {
        orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
        eventId: currentEvent.id, eventType: "text_message", action: "awaiting_approval",
        detail: built.bodyText,
      });
      return { fired: { enrollmentId: enrollId, action: "awaiting approval" } };
    }

    const sendResult = await sendResolvedSequenceSms(adminClient, {
      orgId,
      clientId: client_id ?? null,
      toPhone: built.toPhone,
      bodyText: built.bodyText,
    });
    if (!sendResult.ok) {
      await logSequenceExecution(adminClient, {
        orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
        eventId: currentEvent.id, eventType: "text_message", action: "sms_skipped", detail: sendResult.reason,
      });
      return { skipped: { enrollmentId: enrollId, reason: sendResult.reason } };
    }

    const action = await advanceEnrollmentPastStep(adminClient, {
      enrollmentId: enrollId,
      events: events ?? [],
      completedPosition: next_event_position,
      nowIso,
    });
    await logSequenceExecution(adminClient, {
      orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
      eventId: currentEvent.id, eventType: "text_message", action: "sms_sent",
      detail: `${built.bodyText} → ${built.toPhone}`,
    });
    return { fired: { enrollmentId: enrollId, action: `sms sent → ${action}` } };
  }

  if (currentEvent.event_type === "alert") {
    const recipientIds: string[] = Array.isArray(eventConfig.recipient_user_ids)
      ? eventConfig.recipient_user_ids
      : [];
    if (recipientIds.length === 0) {
      return { skipped: { enrollmentId: enrollId, reason: "no recipient_user_ids configured" } };
    }

    const message = (eventConfig.message as string) || "Automation alert";
    const { error: notifErr } = await adminClient
      .from("notifications")
      .insert(recipientIds.map((userId) => ({ org_id: orgId, user_id: userId, message })));
    if (notifErr) {
      return { skipped: { enrollmentId: enrollId, reason: `failed to insert notifications: ${notifErr.message}` } };
    }

    const action = await advanceEnrollmentPastStep(adminClient, {
      enrollmentId: enrollId,
      events: events ?? [],
      completedPosition: next_event_position,
      nowIso,
    });
    await logSequenceExecution(adminClient, {
      orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
      eventId: currentEvent.id, eventType: "alert", action: "alert_sent",
      detail: `${message} → ${recipientIds.length} user(s)`,
    });
    return { fired: { enrollmentId: enrollId, action: `alert sent to ${recipientIds.length} user(s) → ${action}` } };
  }

  if (currentEvent.event_type === "ticket") {
    const title = (eventConfig.title as string) || "Automation ticket";
    const assignToId = (eventConfig.assign_to as string) || null;

    let assignedToName: string | null = null;
    if (assignToId) {
      const { data: assignee } = await adminClient
        .from("profiles")
        .select("name")
        .eq("id", assignToId)
        .single();
      assignedToName = assignee?.name ?? null;
    }

    const { data: ticket, error: ticketErr } = await adminClient
      .from("crm_tickets")
      .insert({
        org_id: orgId,
        type: "note",
        client_id,
        subject: title,
        body: (eventConfig.description as string) || null,
        priority: (eventConfig.priority as string) || "normal",
        assigned_to_id: assignToId,
        assigned_to: assignedToName,
      })
      .select("id, ticket_number")
      .single();

    if (ticketErr || !ticket) {
      return { skipped: { enrollmentId: enrollId, reason: `failed to create ticket: ${ticketErr?.message ?? "unknown"}` } };
    }

    const notifyBase = { orgId, ticketId: ticket.id, ticketNumber: ticket.ticket_number, subject: title };
    if (assignToId) {
      await notifyTicketAssigned(adminClient, { ...notifyBase, assignedToId: assignToId, assignedToName });
    } else {
      await notifyStaffOfNewTicket(adminClient, { ...notifyBase, assignedToId: null, assignedToName: null, createdByUserId: null });
    }

    const action = await advanceEnrollmentPastStep(adminClient, {
      enrollmentId: enrollId,
      events: events ?? [],
      completedPosition: next_event_position,
      nowIso,
    });
    await logSequenceExecution(adminClient, {
      orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
      eventId: currentEvent.id, eventType: "ticket", action: "ticket_created",
      detail: `#${ticket.ticket_number} — ${title}${assignedToName ? ` → ${assignedToName}` : ""}`,
    });
    return { fired: { enrollmentId: enrollId, action: `ticket created → ${action}` } };
  }

  if (currentEvent.event_type === "update") {
    const field = (eventConfig.field as string) || "";
    const value = (eventConfig.value as string) ?? "";
    const customFieldId = eventConfig.customFieldId as string | undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let updateErr: any = null;
    let detail = `${field} → ${value}`;

    if (field === "sales_person") {
      ({ error: updateErr } = await adminClient
        .from("clients").update({ sales_rep_id: value || null }).eq("id", client_id));
    } else if (field === "client_source") {
      ({ error: updateErr } = await adminClient
        .from("clients").update({ source: value || null }).eq("id", client_id));
    } else if (field === "billing_term") {
      ({ error: updateErr } = await adminClient
        .from("clients").update({ billing_terms: value || null }).eq("id", client_id));
    } else if (field === "custom_field" && customFieldId) {
      const { data: def } = await adminClient
        .from("crm_custom_field_defs").select("name, field_type").eq("id", customFieldId).single();
      const isNumber = def?.field_type === "number";
      ({ error: updateErr } = await adminClient
        .from("crm_client_custom_field_values")
        .upsert({
          org_id: orgId,
          client_id,
          field_def_id: customFieldId,
          value_text: isNumber ? null : value,
          value_number: isNumber ? (Number(value) || null) : null,
        }, { onConflict: "client_id,field_def_id" }));
      detail = `${def?.name ?? "custom field"} → ${value}`;
    } else {
      updateErr = { message: `unsupported update field: ${field}` };
    }

    if (updateErr) {
      return { skipped: { enrollmentId: enrollId, reason: `failed to apply update: ${updateErr.message}` } };
    }

    const action = await advanceEnrollmentPastStep(adminClient, {
      enrollmentId: enrollId,
      events: events ?? [],
      completedPosition: next_event_position,
      nowIso,
    });
    await logSequenceExecution(adminClient, {
      orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
      eventId: currentEvent.id, eventType: "update", action: "field_updated", detail,
    });
    return { fired: { enrollmentId: enrollId, action: `field updated → ${action}` } };
  }

  if (currentEvent.event_type === "note") {
    // Builder-only annotation ("visible only in the builder") — no
    // client-facing or DB side effect, just advance past it.
    const action = await advanceEnrollmentPastStep(adminClient, {
      enrollmentId: enrollId,
      events: events ?? [],
      completedPosition: next_event_position,
      nowIso,
    });
    await logSequenceExecution(adminClient, {
      orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
      eventId: currentEvent.id, eventType: "note", action: "note_skipped",
    });
    return { fired: { enrollmentId: enrollId, action: `note skipped → ${action}` } };
  }

  if (currentEvent.event_type === "tags") {
    const addTags: string[] = Array.isArray(eventConfig.add_tags) ? eventConfig.add_tags : [];
    const removeTags: string[] = Array.isArray(eventConfig.remove_tags) ? eventConfig.remove_tags : [];

    if (addTags.length > 0) {
      const { error: addErr } = await adminClient
        .from("client_tags")
        .upsert(
          addTags.map((tag) => ({ org_id: orgId, client_id, tag })),
          { onConflict: "org_id,client_id,tag", ignoreDuplicates: true }
        );
      if (addErr) {
        return { skipped: { enrollmentId: enrollId, reason: `failed to add tags: ${addErr.message}` } };
      }
    }
    if (removeTags.length > 0) {
      const { error: removeErr } = await adminClient
        .from("client_tags")
        .delete()
        .eq("client_id", client_id)
        .in("tag", removeTags);
      if (removeErr) {
        return { skipped: { enrollmentId: enrollId, reason: `failed to remove tags: ${removeErr.message}` } };
      }
    }

    const action = await advanceEnrollmentPastStep(adminClient, {
      enrollmentId: enrollId,
      events: events ?? [],
      completedPosition: next_event_position,
      nowIso,
    });
    const detail = [
      addTags.length ? `+${addTags.join(",")}` : null,
      removeTags.length ? `-${removeTags.join(",")}` : null,
    ].filter(Boolean).join(" ");
    await logSequenceExecution(adminClient, {
      orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
      eventId: currentEvent.id, eventType: "tags", action: "tags_updated", detail,
    });
    return { fired: { enrollmentId: enrollId, action: `tags updated → ${action}` } };
  }

  await logSequenceExecution(adminClient, {
    orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
    eventId: currentEvent.id, eventType: currentEvent.event_type, action: "unsupported_event_type",
  });
  return { skipped: { enrollmentId: enrollId, reason: `unsupported event_type: ${currentEvent.event_type}` } };
}

/**
 * Drives a freshly-created enrollment through every step that's due right
 * now (no `wait` in front of it) instead of leaving it for the next daily
 * cron sweep — this is what makes a job-completion email send within
 * seconds of the visit being marked complete rather than at the next
 * `/api/automations/run` run. Stops as soon as a step schedules the
 * enrollment into the future (a `wait`), parks it for approval, completes
 * it, or stops it — the remaining steps are then picked up by the daily
 * cron like any other enrollment. Capped at maxSteps as a backstop against
 * a misconfigured sequence looping on itself.
 */
export async function processEnrollmentImmediately(
  adminClient: AnyClient,
  enrollmentId: string,
  maxSteps = 10
): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    const { data: row } = await adminClient
      .from("crm_sequence_enrollments")
      .select("id, org_id, sequence_id, client_id, estimate_id, ticket_id, invoice_id, next_event_position, next_fire_at, completed_at, stopped_at, awaiting_approval")
      .eq("id", enrollmentId)
      .maybeSingle();

    if (!row || row.completed_at || row.stopped_at || row.awaiting_approval) return;
    if (new Date(row.next_fire_at).getTime() > Date.now()) return; // scheduled for later (e.g. behind a wait step)

    await processDueEnrollment(adminClient, row);
  }
}
