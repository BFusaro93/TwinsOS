import { resolveEmailStepContent, sendResolvedSequenceEmail, advanceEnrollmentPastStep } from "./sequence-email";
import { resolveSmsStepContent, sendResolvedSequenceSms } from "./sequence-sms";
import { notifyStaffOfNewTicket, notifyTicketAssigned } from "@/lib/ticket-notify";
import { shouldStopSequence, logSequenceExecution, evaluateConditionSet, computeWaitFireAt } from "./sequence-enrollment";
import { fetchCardExpiryContext, type CardExpiryContext } from "./card-expiry-context";
import type { ConditionField, ConditionOperator } from "@/types/crm-automations";

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
  meeting_id: string | null;
  next_event_position: number;
}

export type ProcessOutcome =
  | { fired: { enrollmentId: string; action: string } }
  | { skipped: { enrollmentId: string; reason: string } };

/**
 * How long a claimed enrollment is hidden from other runs while one run
 * works its current step. Every branch that finishes a step writes its own
 * next_fire_at, so this only matters when a run dies mid-step (or a branch
 * bails without rescheduling) — the step then becomes due again after this.
 */
const CLAIM_LEASE_MS = 10 * 60 * 1000;

/** Sends that fail for a reason that might clear (provider outage, rate
 *  limit, missing config) are retried this many times in total, then the
 *  enrollment is stopped. */
const MAX_SEND_ATTEMPTS = 5;
/** First retry delay; doubles each attempt (15m, 30m, 1h, 2h). */
const SEND_RETRY_BASE_MS = 15 * 60 * 1000;

/**
 * Atomically claims the enrollment's current step: only one caller can move
 * next_fire_at from "due" to "leased" for a given position, so the cron
 * sweep (now every 15 minutes) and an immediate post-enrollment run can
 * never both send the same email/SMS.
 */
async function claimEnrollmentStep(adminClient: AnyClient, enrollment: DueEnrollmentRow): Promise<boolean> {
  const now = Date.now();
  const { data } = await adminClient
    .from("crm_sequence_enrollments")
    .update({ next_fire_at: new Date(now + CLAIM_LEASE_MS).toISOString() })
    .eq("id", enrollment.id)
    .eq("next_event_position", enrollment.next_event_position)
    .lte("next_fire_at", new Date(now).toISOString())
    .is("completed_at", null)
    .is("stopped_at", null)
    .eq("awaiting_approval", false)
    .select("id");
  return ((data ?? []) as unknown[]).length > 0;
}

interface SendFailureContext {
  orgId: string;
  enrollId: string;
  sequenceId: string;
  clientId: string | null;
  eventId: string;
  eventType: "email" | "text_message";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  events: any[];
  position: number;
  nowIso: string;
}

/**
 * What happens when an email/SMS step can't go out. Returning `skipped`
 * without touching the enrollment (the old behavior) left it due forever:
 * the sweep kept picking the same rows up, and the one-active-enrollment
 * rule meant the client could never be re-enrolled either.
 *
 *  - permanent (opted out, bounced, no SMS consent, no usable recipient,
 *    provider rejected the message itself): log it and move past this step
 *    so the rest of the sequence still runs — the same thing a human would
 *    do with an undeliverable message.
 *  - transient (provider down, rate-limited, not configured yet): push
 *    next_fire_at out with exponential backoff; after MAX_SEND_ATTEMPTS the
 *    enrollment is stopped (stopped_at — the existing "ended without
 *    finishing" state) so it stops occupying the client's active slot.
 */
async function handleSendFailure(
  adminClient: AnyClient,
  ctx: SendFailureContext,
  reason: string,
  permanent: boolean
): Promise<ProcessOutcome> {
  const prefix = ctx.eventType === "email" ? "email" : "sms";
  const logBase = {
    orgId: ctx.orgId, enrollmentId: ctx.enrollId, sequenceId: ctx.sequenceId, clientId: ctx.clientId,
    eventId: ctx.eventId, eventType: ctx.eventType,
  };

  if (permanent) {
    const action = await advanceEnrollmentPastStep(adminClient, {
      enrollmentId: ctx.enrollId,
      events: ctx.events,
      completedPosition: ctx.position,
      nowIso: ctx.nowIso,
    });
    await logSequenceExecution(adminClient, { ...logBase, action: `${prefix}_skipped`, detail: `${reason} — step skipped` });
    return { skipped: { enrollmentId: ctx.enrollId, reason: `${reason} — step skipped, ${action}` } };
  }

  // Attempt count comes from the execution log rather than a new column —
  // one row per failed attempt at this exact step of this enrollment.
  const { count } = await adminClient
    .from("crm_sequence_execution_log")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", ctx.enrollId)
    .eq("event_id", ctx.eventId)
    .eq("action", `${prefix}_send_failed`);
  const attempt = (count ?? 0) + 1;

  await logSequenceExecution(adminClient, {
    ...logBase, action: `${prefix}_send_failed`, detail: `attempt ${attempt}/${MAX_SEND_ATTEMPTS}: ${reason}`,
  });

  if (attempt >= MAX_SEND_ATTEMPTS) {
    await adminClient
      .from("crm_sequence_enrollments")
      .update({ stopped_at: ctx.nowIso, updated_at: ctx.nowIso })
      .eq("id", ctx.enrollId);
    await logSequenceExecution(adminClient, {
      ...logBase, action: "stopped_send_failed", detail: `gave up after ${attempt} attempts: ${reason}`,
    });
    return { skipped: { enrollmentId: ctx.enrollId, reason: `${reason} — gave up after ${attempt} attempts, enrollment stopped` } };
  }

  const retryAt = new Date(Date.now() + SEND_RETRY_BASE_MS * 2 ** (attempt - 1)).toISOString();
  await adminClient
    .from("crm_sequence_enrollments")
    .update({ next_fire_at: retryAt, updated_at: ctx.nowIso })
    .eq("id", ctx.enrollId);
  return { skipped: { enrollmentId: ctx.enrollId, reason: `${reason} — retry ${attempt + 1}/${MAX_SEND_ATTEMPTS} at ${retryAt}` } };
}

/**
 * Processes exactly one due step for one enrollment: evaluates stop
 * conditions, dispatches on the current event's type (wait/email/text_message/
 * alert/ticket/update/note/tags/if_branch), and advances (or completes/stops) the
 * enrollment. Shared by the cron sweep (every 15 min, `/api/automations/run`) and by
 * the immediate-send path fired right when a client is enrolled — this is the
 * single source of truth for "what happens when a sequence step comes due" so
 * both call sites stay in lockstep.
 */
export async function processDueEnrollment(
  adminClient: AnyClient,
  enrollment: DueEnrollmentRow
): Promise<ProcessOutcome> {
  // Canceled orgs are read-only — nothing goes out to their clients. The
  // enrollment is left due, so it resumes if the org resubscribes.
  const { data: org } = await adminClient.from("organizations").select("plan").eq("id", enrollment.org_id).maybeSingle();
  if (org?.plan === "canceled") {
    return { skipped: { enrollmentId: enrollment.id, reason: "org subscription is canceled" } };
  }
  if (!(await claimEnrollmentStep(adminClient, enrollment))) {
    return { skipped: { enrollmentId: enrollment.id, reason: "already claimed by another run (or no longer due)" } };
  }
  return runClaimedStep(adminClient, enrollment);
}

async function runClaimedStep(
  adminClient: AnyClient,
  enrollment: DueEnrollmentRow
): Promise<ProcessOutcome> {
  const nowIso = new Date().toISOString();
  const { id: enrollId, org_id: orgId, sequence_id, client_id, estimate_id, ticket_id, invoice_id, meeting_id, next_event_position } = enrollment;

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

  // Only the credit_card_about_to_expire trigger's own enrollments get real
  // [creditcardending]/[creditcardexpiration] values — check the sequence's
  // trigger type before ever calling Stripe, so every other trigger type
  // (the vast majority of enrollments) pays no extra query or API call.
  let cardExpiryContext: CardExpiryContext | null = null;
  if ((currentEvent.event_type === "email" || currentEvent.event_type === "text_message") && client_id) {
    const { data: trigger } = await adminClient
      .from("crm_sequence_triggers")
      .select("id")
      .eq("sequence_id", sequence_id)
      .eq("trigger_type", "credit_card_about_to_expire")
      .limit(1)
      .maybeSingle();
    if (trigger) {
      cardExpiryContext = await fetchCardExpiryContext(adminClient, client_id);
    }
  }

  if (currentEvent.event_type === "wait") {
    // `currentEvent` here IS the due wait step (this branch is only reached
    // when a wait becomes "current" — i.e. two or more `wait` steps are
    // stacked back-to-back, since a single wait's delay is normally
    // pre-consumed when *stepping into* it via computeWaitFireAt in
    // enrollClientInSequence/advanceEnrollmentPastStep). So the delay for
    // advancing past it must come from currentEvent's OWN config, not the
    // event that follows it — using the next event's config here skipped
    // this wait's delay entirely for any chain of 2+ consecutive waits.
    const nextPos = next_event_position + 1;
    const waitConfig = (currentEvent.config as Record<string, number>) ?? {};
    const newFireAt = computeWaitFireAt(waitConfig).toISOString();
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
      meetingId: meeting_id ?? null,
      subjectTemplate: eventConfig.subject ?? "",
      bodyTemplate: eventConfig.bodyHtml ?? eventConfig.body ?? "",
      toSelection: eventConfig.to,
      fromSelection: eventConfig.from,
      cardExpiryContext,
    });
    const failureCtx: SendFailureContext = {
      orgId, enrollId, sequenceId: sequence_id, clientId: client_id, eventId: currentEvent.id,
      eventType: "email", events: events ?? [], position: next_event_position, nowIso,
    };
    // Every resolve error is about the recipient (not found, do_not_market,
    // hard-bounced, no address for the selected 'to' options) — none of
    // them change by retrying, so skip the step.
    if ("error" in built) {
      return handleSendFailure(adminClient, failureCtx, built.error, true);
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
      // Carry the resolved sender ("from sales rep" or the org-branded
      // default) through; the approvals path already does this.
      fromAddress: built.fromAddress,
      // …and the matching reply address, so a rep-sent step's replies reach
      // the rep rather than the org's general mailbox.
      replyTo: built.replyTo,
    });
    if (!sendResult.ok) {
      return handleSendFailure(adminClient, failureCtx, sendResult.reason, sendResult.permanent === true);
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
      meetingId: meeting_id ?? null,
      bodyTemplate: eventConfig.message ?? "",
      cardExpiryContext,
    });
    const failureCtx: SendFailureContext = {
      orgId, enrollId, sequenceId: sequence_id, clientId: client_id, eventId: currentEvent.id,
      eventType: "text_message", events: events ?? [], position: next_event_position, nowIso,
    };
    // No phone / no SMS consent — permanent for this step.
    if ("error" in built) {
      return handleSendFailure(adminClient, failureCtx, built.error, true);
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
      return handleSendFailure(adminClient, failureCtx, sendResult.reason, sendResult.permanent === true);
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
    // type/title/entity_id/entity_type are required for this row to actually
    // surface in NotificationsBell — it queries `.in("type", [...])` against
    // an explicit allowlist, so a row with no `type` (the bug this fixes)
    // is inserted but never shown to anyone.
    const { error: notifErr } = await adminClient
      .from("notifications")
      .insert(recipientIds.map((userId) => ({
        org_id: orgId,
        user_id: userId,
        type: "automation_alert",
        title: "Automation Alert",
        message,
        entity_id: client_id ?? null,
        entity_type: client_id ? "client" : null,
      })));
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
        .from("crm_employees")
        .select("first_name, last_name")
        .eq("id", assignToId)
        .single();
      assignedToName = assignee ? `${assignee.first_name} ${assignee.last_name}`.trim() : null;
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

  if (currentEvent.event_type === "if_branch") {
    const conditions = (Array.isArray(eventConfig.conditions) ? eventConfig.conditions : []) as
      { field: ConditionField; operator: ConditionOperator; value: string | null }[];
    const conditionsMet = await evaluateConditionSet(
      adminClient, conditions, "AND", client_id, estimate_id, ticket_id, invoice_id
    );

    const future = (events ?? [])
      .filter((e: { position: number }) => e.position > next_event_position)
      .sort((a: { position: number }, b: { position: number }) => a.position - b.position);

    // crm_sequence_events is a flat, position-ordered list — there's no
    // parent/end-marker to represent a real nested block, even though the IF
    // Branch dialog's copy describes "events nested under this IF block".
    // So the guarded body is exactly the single event immediately following
    // this one: conditions met → continue into it normally; conditions not
    // met → skip past it straight to whatever comes after. A true multi-step
    // block needs a schema change (e.g. an explicit block/end marker) to do
    // properly — this is the best approximation the current data model
    // supports, and it's the only one that keeps single-event bodies (the
    // common case) actually branching correctly.
    const skipToPosition = conditionsMet ? next_event_position : (future[0]?.position ?? next_event_position);

    const action = await advanceEnrollmentPastStep(adminClient, {
      enrollmentId: enrollId,
      events: events ?? [],
      completedPosition: skipToPosition,
      nowIso,
    });
    await logSequenceExecution(adminClient, {
      orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
      eventId: currentEvent.id, eventType: "if_branch", action: conditionsMet ? "branch_true" : "branch_false",
      detail: conditionsMet ? "conditions met — continuing into branch" : "conditions not met — branch skipped",
    });
    return { fired: { enrollmentId: enrollId, action: `if_branch ${conditionsMet ? "true" : "false"} → ${action}` } };
  }

  await logSequenceExecution(adminClient, {
    orgId, enrollmentId: enrollId, sequenceId: sequence_id, clientId: client_id,
    eventId: currentEvent.id, eventType: currentEvent.event_type, action: "unsupported_event_type",
  });
  return { skipped: { enrollmentId: enrollId, reason: `unsupported event_type: ${currentEvent.event_type}` } };
}

/**
 * Drives a freshly-created enrollment through every step that's due right
 * now (no `wait` in front of it) instead of leaving it for the next
 * cron sweep — this is what makes a job-completion email send within
 * seconds of the visit being marked complete rather than at the next
 * `/api/automations/run` run. Stops as soon as a step schedules the
 * enrollment into the future (a `wait`), parks it for approval, completes
 * it, or stops it — the remaining steps are then picked up by the 15-minute
 * cron like any other enrollment. Capped at maxSteps as a backstop against
 * a misconfigured sequence looping on itself.
 *
 * A failed step can't be re-attempted within one call: processDueEnrollment
 * claims the step by pushing next_fire_at into the future, and a failure
 * either leaves it there (retry backoff / lease) — which ends this loop — or
 * moves past the step. The position check below is a second guard: if a
 * step ran and the enrollment is still due at the SAME position, stop rather
 * than spin on it.
 */
export async function processEnrollmentImmediately(
  adminClient: AnyClient,
  enrollmentId: string,
  maxSteps = 10
): Promise<void> {
  let lastPosition: number | null = null;
  for (let i = 0; i < maxSteps; i++) {
    const { data: row } = await adminClient
      .from("crm_sequence_enrollments")
      .select("id, org_id, sequence_id, client_id, estimate_id, ticket_id, invoice_id, meeting_id, next_event_position, next_fire_at, completed_at, stopped_at, awaiting_approval")
      .eq("id", enrollmentId)
      .maybeSingle();

    if (!row || row.completed_at || row.stopped_at || row.awaiting_approval) return;
    if (new Date(row.next_fire_at).getTime() > Date.now()) return; // scheduled for later (e.g. behind a wait step)
    if (lastPosition !== null && row.next_event_position === lastPosition) return;

    lastPosition = row.next_event_position;
    const outcome = await processDueEnrollment(adminClient, row);
    if ("skipped" in outcome && (outcome.skipped.reason.startsWith("already claimed") || outcome.skipped.reason === "org subscription is canceled")) return;
  }
}
