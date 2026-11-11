import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  sendResolvedSequenceEmail,
  advanceEnrollmentPastStep,
  isMarketingEmailCategory,
  resolveEmailRecipients,
} from "@/lib/automations/sequence-email";
import {
  emailSendDeferral,
  enrollmentEndReason,
  intersectPhones,
  stopEnrollment,
  type EnrollmentGateRow,
} from "@/lib/automations/sequence-processor";
import { sendResolvedSequenceSms, nextSmsSendTime, resolveSmsRecipients } from "@/lib/automations/sequence-sms";
import { instantToZoneWallClock } from "@/lib/time/zone";
import { logSequenceExecution, shouldStopSequence } from "@/lib/automations/sequence-enrollment";

const decisionSchema = z.object({ action: z.enum(["approve", "reject"]) });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

interface ApprovalRow {
  id: string;
  org_id: string;
  enrollment_id: string;
  event_id: string;
  sequence_id: string;
  client_id: string | null;
  estimate_id: string | null;
  channel: "email" | "sms";
  to_email: string | null;
  to_name: string | null;
  subject: string | null;
  body_html: string;
  to_phone: string | null;
  body_text: string | null;
  from_address: string | null;
  reply_to: string | null;
  status: string;
}

interface EnrollmentRow extends EnrollmentGateRow {
  org_id: string;
  next_event_position: number;
  stopped_at: string | null;
  completed_at: string | null;
  deleted_at: string | null;
}

/**
 * Rejects a queued step on the system's behalf (no person decided it) with the
 * reason it can't go out. Only a still-pending row is touched, so it can't
 * overwrite a decision someone else just made. Service client: users may only
 * change status/decided_by/decided_at on an approval, not the reason.
 */
async function systemReject(admin: AnyClient, approvalId: string, reason: string, nowIso: string): Promise<boolean> {
  const { data } = await admin
    .from("crm_sequence_step_approvals")
    .update({ status: "rejected", decided_by: null, decided_at: nowIso, decision_reason: reason })
    .eq("id", approvalId)
    .eq("status", "pending")
    .select("id");
  return ((data ?? []) as unknown[]).length > 0;
}

/** Moves the run past a queued step that can't be sent (the same thing the step
 *  processor does with an undeliverable message) so the rest of the sequence runs. */
async function skipQueuedStep(
  admin: AnyClient,
  approval: ApprovalRow,
  enrollment: EnrollmentRow,
  reason: string,
  nowIso: string
): Promise<void> {
  const { data: events } = await admin
    .from("crm_sequence_events")
    .select("id, event_type, config, position")
    .eq("sequence_id", enrollment.sequence_id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("position", { ascending: true });
  await advanceEnrollmentPastStep(admin, {
    enrollmentId: enrollment.id,
    events: events ?? [],
    completedPosition: enrollment.next_event_position,
    nowIso,
  });
  await admin
    .from("crm_sequence_enrollments")
    .update({ awaiting_approval: false, updated_at: nowIso })
    .eq("id", enrollment.id);
  await logSequenceExecution(admin, {
    orgId: approval.org_id, enrollmentId: approval.enrollment_id, sequenceId: approval.sequence_id,
    clientId: approval.client_id, eventId: approval.event_id, eventType: approval.channel,
    action: `${approval.channel === "sms" ? "sms" : "email"}_skipped`, detail: `${reason} — queued step rejected automatically`,
  });
}

function gateFailed(message: string) {
  return NextResponse.json(
    { error: `Not sent: ${message}. The step was rejected automatically.`, rejected: true },
    { status: 409 }
  );
}

/**
 * POST /api/crm/automations/approvals/[id] — approve or reject a pending
 * email or text-message step approval (crm_sequence_step_approvals).
 * Approving sends the already-resolved content (via the channel column) and
 * advances the enrollment past that step; rejecting stops that enrollment's
 * run of the sequence — this gates the one send, not the automation/sequence
 * configuration as a whole.
 *
 * Before an approved step goes out it passes the same checks as a step that
 * never needed approval (the queue can hold a step for days): the run, its
 * sequence and automation are still live, the client still exists, the run's
 * invoice/estimate/ticket/meeting still applies, no stop condition is met, the
 * step itself still exists, and only recipients who may be contacted TODAY get
 * it. A step that fails a check is rejected automatically with the reason.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS on crm_sequence_step_approvals only checks org_id, not role — without
  // this, any authenticated org member (including viewer/technician/crew)
  // could approve or reject a queued outbound client email/SMS, unlike every
  // other approval surface in the app (approval_requests chain order,
  // approval_flows config) which is role-gated.
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  // profiles.role limits are Equipt-only; Landscapt access follows crm_roles, so a login
  // whose Landscapt role may create/modify automations can approve their outbound steps too.
  const roleAllowed = !!callerProfile && ["admin", "manager"].includes(callerProfile.role);
  let keyAllowed = false;
  if (!roleAllowed && callerProfile) {
    const { data } = await supabase.rpc("has_settings_permission", { p_key: "automation_create_modify" });
    keyAllowed = data === true;
  }
  if (!roleAllowed && !keyAllowed) {
    return NextResponse.json({ error: "You need the Create/Modify Automation permission to approve automation steps" }, { status: 403 });
  }

  const parsed = decisionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }
  const action = parsed.data.action;

  const db = supabase as unknown as AnyClient;

  // Read through the caller's session: RLS scopes it to their org, so the id can
  // only name one of their own approvals. Everything after keys off this row.
  const { data: approvalData, error: approvalErr } = await db
    .from("crm_sequence_step_approvals")
    .select("id, org_id, enrollment_id, event_id, sequence_id, client_id, estimate_id, channel, to_email, to_name, subject, body_html, to_phone, body_text, from_address, reply_to, status")
    .eq("id", id)
    .single();

  if (approvalErr || !approvalData) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }
  const approval = approvalData as ApprovalRow;
  if (approval.status !== "pending") {
    return NextResponse.json({ error: `Already ${approval.status}` }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  // System-side reads/writes (the processor's checks, system rejections, the
  // enrollment bookkeeping) run as the service role, scoped to this approval.
  const admin = createServiceClient() as unknown as AnyClient;

  if (action === "reject") {
    // Conditional on still pending: a concurrent approve (or another reject)
    // that landed first wins, and this one reports it instead of overwriting it.
    const { data: rejected } = await db
      .from("crm_sequence_step_approvals")
      .update({ status: "rejected", decided_by: user.id, decided_at: nowIso })
      .eq("id", id)
      .eq("status", "pending")
      .select("id");
    if (!rejected || rejected.length === 0) {
      return NextResponse.json({ error: "Already decided" }, { status: 409 });
    }
    await admin
      .from("crm_sequence_enrollments")
      .update({ stopped_at: nowIso, stop_reason: "a queued step was rejected", awaiting_approval: false, updated_at: nowIso })
      .eq("id", approval.enrollment_id)
      .eq("org_id", approval.org_id)
      .is("completed_at", null)
      .is("stopped_at", null);
    await logSequenceExecution(admin, {
      orgId: approval.org_id, enrollmentId: approval.enrollment_id, sequenceId: approval.sequence_id,
      clientId: approval.client_id, eventId: approval.event_id, eventType: approval.channel,
      action: "approval_rejected", detail: `${approval.subject ?? approval.body_text} — decided by ${user.id}`,
    });
    return NextResponse.json({ ok: true, action: "rejected" });
  }

  // ── Gates (approve) ──────────────────────────────────────────────────────
  const { data: enrollmentData } = await admin
    .from("crm_sequence_enrollments")
    .select("id, org_id, sequence_id, client_id, estimate_id, ticket_id, invoice_id, meeting_id, next_event_position, stopped_at, completed_at, deleted_at")
    .eq("id", approval.enrollment_id)
    .eq("org_id", approval.org_id)
    .maybeSingle();
  const enrollment = enrollmentData as EnrollmentRow | null;

  if (!enrollment || enrollment.stopped_at || enrollment.completed_at || enrollment.deleted_at) {
    const reason = "this automation run already ended";
    if (!(await systemReject(admin, id, reason, nowIso))) return NextResponse.json({ error: "Already decided" }, { status: 409 });
    return gateFailed(reason);
  }

  // The run itself must end (automation off, client deleted, meeting moved,
  // invoice paid / estimate decided / ticket closed, or a stop condition met).
  const endReason =
    (await enrollmentEndReason(admin, enrollment))
    ?? ((await shouldStopSequence(admin, enrollment.sequence_id, enrollment.client_id, enrollment.estimate_id, enrollment.ticket_id, enrollment.invoice_id))
      ? { action: "stopped_by_condition", detail: "a stop condition was met" }
      : null);
  if (endReason) {
    if (!(await systemReject(admin, id, endReason.detail, nowIso))) return NextResponse.json({ error: "Already decided" }, { status: 409 });
    await stopEnrollment(admin, {
      orgId: approval.org_id, enrollId: enrollment.id, sequenceId: enrollment.sequence_id, clientId: enrollment.client_id,
      nowIso, ...endReason,
    });
    return gateFailed(endReason.detail);
  }

  // The step's own settings (Email Category, Send window, Mon-Fri flag, To) live
  // on its event; the queued row only holds the resolved content. A step that
  // was deleted or switched off since it was queued is skipped, like the
  // processor skips an inactive step.
  const { data: ev } = await admin
    .from("crm_sequence_events")
    .select("config, is_active, deleted_at, sequence_id")
    .eq("id", approval.event_id)
    .maybeSingle();
  const event = ev as { config: Record<string, unknown> | null; is_active: boolean; deleted_at: string | null; sequence_id: string } | null;
  if (!event || event.deleted_at || event.is_active === false || event.sequence_id !== enrollment.sequence_id) {
    const reason = "this step was removed or turned off";
    if (!(await systemReject(admin, id, reason, nowIso))) return NextResponse.json({ error: "Already decided" }, { status: 409 });
    await skipQueuedStep(admin, approval, enrollment, reason, nowIso);
    return gateFailed(reason);
  }
  const eventConfig = (event.config ?? {}) as Record<string, unknown>;
  const marketingEmail = isMarketingEmailCategory(eventConfig.category as string | undefined);
  const toSelection = Array.isArray(eventConfig.to) ? (eventConfig.to as unknown[]).filter((v): v is string => typeof v === "string") : undefined;

  // Recipients are re-resolved with today's rules (opt-outs, OK to Email,
  // bounces, STOP replies, the client's current addresses) and intersected with
  // the ones that were approved: nobody new is added, and anybody who can no
  // longer be contacted is dropped.
  let approvedToEmails: string[] = [];
  let approvedToPhone = "";
  {
    let reason: string | null = null;
    if (!enrollment.client_id) {
      reason = "this step has no client to send to";
    } else if (approval.channel === "sms") {
      const fresh = await resolveSmsRecipients(admin, { orgId: approval.org_id, clientId: enrollment.client_id, toSelection });
      if ("error" in fresh) reason = fresh.error;
      else {
        const kept = intersectPhones(approval.to_phone ?? "", fresh.toPhones);
        if (kept.length === 0) reason = "the approved number can no longer be texted (replied STOP or removed)";
        approvedToPhone = kept.join(", ");
      }
    } else {
      const fresh = await resolveEmailRecipients(admin, {
        orgId: approval.org_id, clientId: enrollment.client_id, toSelection, category: eventConfig.category as string | undefined,
      });
      if ("error" in fresh) reason = fresh.error;
      else {
        const allowed = new Set(fresh.toEmails.map((e) => e.trim().toLowerCase()));
        approvedToEmails = String(approval.to_email ?? "").split(",").map((e) => e.trim())
          .filter((e) => e && allowed.has(e.toLowerCase()));
        if (approvedToEmails.length === 0) reason = "the approved recipients can no longer be emailed (opted out, bounced or removed)";
      }
    }
    if (reason) {
      if (!(await systemReject(admin, id, reason, nowIso))) return NextResponse.json({ error: "Already decided" }, { status: 409 });
      await skipQueuedStep(admin, approval, enrollment, reason, nowIso);
      return gateFailed(reason);
    }
  }

  // Claim the decision BEFORE sending so two people clicking Approve (or a
  // double-submit) can't both pass the pending check above and send twice.
  const { data: claimed } = await db
    .from("crm_sequence_step_approvals")
    .update({ status: "approved", decided_by: user.id, decided_at: nowIso })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: "Already decided" }, { status: 409 });
  }

  // Texts approved outside quiet hours (8am-9pm org time) must not go out
  // now: the processor checked quiet hours when the step was queued, but the
  // approval can land at any hour. Keep the approval as approved, release the
  // enrollment and schedule it for the next 8:00 AM; the processor sends the
  // approved text then (re-checking every gate and the recipients at the send).
  if (approval.channel === "sms") {
    const deferred = await nextSmsSendTime(admin, approval.org_id);
    if (deferred) {
      const sendAtIso = deferred.sendAt.toISOString();
      await admin
        .from("crm_sequence_enrollments")
        .update({ awaiting_approval: false, next_fire_at: sendAtIso, updated_at: nowIso })
        .eq("id", approval.enrollment_id);
      const wallNow = instantToZoneWallClock(new Date(), deferred.tz);
      const wallSend = instantToZoneWallClock(deferred.sendAt, deferred.tz);
      const when = wallSend.date === wallNow.date ? "today" : "tomorrow";
      await logSequenceExecution(admin, {
        orgId: approval.org_id, enrollmentId: approval.enrollment_id, sequenceId: approval.sequence_id,
        clientId: approval.client_id, eventId: approval.event_id, eventType: approval.channel,
        action: "approval_approved",
        detail: `${approval.body_text} → ${approvedToPhone} — approved by ${user.id}, held for quiet hours until ${sendAtIso}`,
      });
      return NextResponse.json({
        ok: true,
        action: "approved",
        deferred: true,
        sendAt: sendAtIso,
        message: `Approved — will send ${when} at 8:00 AM`,
      });
    }
  }

  // Emails approved outside the step's "Send Between" window or on a weekend
  // (with "Send Mon-Fri only") must not go out now: same rules as the
  // processor, via the shared emailSendDeferral. Keep the approval as approved,
  // release the enrollment and schedule it; the processor then sends the
  // approved email when it comes due (re-checking every gate and the recipients).
  if (approval.channel !== "sms") {
    const deferral = await emailSendDeferral(admin, approval.org_id, eventConfig);
    if (deferral) {
      const sendAtIso = deferral.fireAt.toISOString();
      await admin
        .from("crm_sequence_enrollments")
        .update({ awaiting_approval: false, next_fire_at: sendAtIso, updated_at: nowIso })
        .eq("id", approval.enrollment_id);
      await logSequenceExecution(admin, {
        orgId: approval.org_id, enrollmentId: approval.enrollment_id, sequenceId: approval.sequence_id,
        clientId: approval.client_id, eventId: approval.event_id, eventType: approval.channel,
        action: "approval_approved",
        detail: `${approval.subject} → ${approvedToEmails.join(", ")} — approved by ${user.id}, held until ${sendAtIso} (send window)`,
      });
      return NextResponse.json({
        ok: true,
        action: "approved",
        deferred: true,
        sendAt: sendAtIso,
        message: "Approved — will send when the email's send window opens",
      });
    }
  }

  // Approve: send the already-resolved content to the still-contactable
  // recipients, then advance the enrollment exactly like a normal
  // (non-approval) step of that channel would.
  const sendResult =
    approval.channel === "sms"
      ? await sendResolvedSequenceSms(admin, {
          orgId: approval.org_id,
          clientId: approval.client_id ?? null,
          toPhone: approvedToPhone,
          bodyText: approval.body_text ?? "",
        })
      : await sendResolvedSequenceEmail(admin, {
          orgId: approval.org_id,
          clientId: approval.client_id ?? null,
          estimateId: approval.estimate_id,
          toEmails: approvedToEmails,
          toName: approval.to_name,
          subject: approval.subject ?? "",
          bodyHtml: approval.body_html,
          fromAddress: approval.from_address ?? undefined,
          // null on rows queued before reply_to existed — undefined lets
          // sendResolvedSequenceEmail fall back to the org reply address.
          replyTo: approval.reply_to ?? undefined,
          marketing: marketingEmail,
        });
  if (!sendResult.ok) {
    // Nothing went out — hand the approval back so it can be retried.
    await db
      .from("crm_sequence_step_approvals")
      .update({ status: "pending", decided_by: null, decided_at: null })
      .eq("id", id)
      .eq("status", "approved");
    return NextResponse.json({ error: sendResult.reason }, { status: 502 });
  }

  await logSequenceExecution(admin, {
    orgId: approval.org_id, enrollmentId: approval.enrollment_id, sequenceId: approval.sequence_id,
    clientId: approval.client_id, eventId: approval.event_id, eventType: approval.channel,
    action: "approval_approved",
    detail: approval.channel === "sms"
      ? `${approval.body_text} → ${approvedToPhone} — decided by ${user.id}`
      : `${approval.subject} → ${approvedToEmails.join(", ")} — decided by ${user.id}`,
  });

  const { data: events } = await admin
    .from("crm_sequence_events")
    .select("id, event_type, config, position")
    .eq("sequence_id", enrollment.sequence_id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  await advanceEnrollmentPastStep(admin, {
    enrollmentId: enrollment.id,
    events: events ?? [],
    completedPosition: enrollment.next_event_position,
    nowIso,
  });

  await admin
    .from("crm_sequence_enrollments")
    .update({ awaiting_approval: false, updated_at: nowIso })
    .eq("id", approval.enrollment_id);

  return NextResponse.json({ ok: true, action: "approved" });
}
