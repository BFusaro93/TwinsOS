import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendResolvedSequenceEmail, advanceEnrollmentPastStep } from "@/lib/automations/sequence-email";
import { sendResolvedSequenceSms } from "@/lib/automations/sequence-sms";
import { logSequenceExecution } from "@/lib/automations/sequence-enrollment";

/**
 * POST /api/crm/automations/approvals/[id] — approve or reject a pending
 * email or text-message step approval (crm_sequence_step_approvals).
 * Approving sends the already-resolved content (via the channel column) and
 * advances the enrollment past that step; rejecting stops that enrollment's
 * run of the sequence — this gates the one send, not the automation/sequence
 * configuration as a whole.
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
  if (!callerProfile || !["admin", "manager"].includes(callerProfile.role)) {
    return NextResponse.json({ error: "Admin or manager role required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as any;

  const { data: approval, error: approvalErr } = await db
    .from("crm_sequence_step_approvals")
    .select("id, org_id, enrollment_id, event_id, sequence_id, client_id, estimate_id, channel, to_email, to_name, subject, body_html, to_phone, body_text, from_address, status")
    .eq("id", id)
    .single();

  if (approvalErr || !approval) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }
  if (approval.status !== "pending") {
    return NextResponse.json({ error: `Already ${approval.status}` }, { status: 409 });
  }

  const nowIso = new Date().toISOString();

  if (body.action === "reject") {
    await db
      .from("crm_sequence_step_approvals")
      .update({ status: "rejected", decided_by: user.id, decided_at: nowIso })
      .eq("id", id);
    await db
      .from("crm_sequence_enrollments")
      .update({ stopped_at: nowIso, awaiting_approval: false, updated_at: nowIso })
      .eq("id", approval.enrollment_id);
    await logSequenceExecution(db, {
      orgId: approval.org_id, enrollmentId: approval.enrollment_id, sequenceId: approval.sequence_id,
      clientId: approval.client_id, eventId: approval.event_id, eventType: approval.channel,
      action: "approval_rejected", detail: `${approval.subject ?? approval.body_text} — decided by ${user.id}`,
    });
    return NextResponse.json({ ok: true, action: "rejected" });
  }

  // Approve: send the already-resolved content, then advance the enrollment
  // exactly like a normal (non-approval) step of that channel would.
  const sendResult =
    approval.channel === "sms"
      ? await sendResolvedSequenceSms(db, {
          orgId: approval.org_id,
          clientId: approval.client_id ?? null,
          toPhone: approval.to_phone,
          bodyText: approval.body_text,
        })
      : await sendResolvedSequenceEmail(db, {
          orgId: approval.org_id,
          clientId: approval.client_id ?? null,
          estimateId: approval.estimate_id,
          toEmails: approval.to_email.split(",").map((e: string) => e.trim()).filter(Boolean),
          toName: approval.to_name,
          subject: approval.subject,
          bodyHtml: approval.body_html,
          fromAddress: approval.from_address ?? undefined,
        });
  if (!sendResult.ok) {
    return NextResponse.json({ error: sendResult.reason }, { status: 502 });
  }

  const { data: enrollment } = await db
    .from("crm_sequence_enrollments")
    .select("id, sequence_id, next_event_position")
    .eq("id", approval.enrollment_id)
    .single();

  if (enrollment) {
    const { data: events } = await db
      .from("crm_sequence_events")
      .select("id, event_type, config, position")
      .eq("sequence_id", enrollment.sequence_id)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("position", { ascending: true });

    await advanceEnrollmentPastStep(db, {
      enrollmentId: enrollment.id,
      events: events ?? [],
      completedPosition: enrollment.next_event_position,
      nowIso,
    });
  }

  await db
    .from("crm_sequence_enrollments")
    .update({ awaiting_approval: false, updated_at: nowIso })
    .eq("id", approval.enrollment_id);

  await db
    .from("crm_sequence_step_approvals")
    .update({ status: "approved", decided_by: user.id, decided_at: nowIso })
    .eq("id", id);

  await logSequenceExecution(db, {
    orgId: approval.org_id, enrollmentId: approval.enrollment_id, sequenceId: approval.sequence_id,
    clientId: approval.client_id, eventId: approval.event_id, eventType: approval.channel,
    action: "approval_approved",
    detail: approval.channel === "sms"
      ? `${approval.body_text} → ${approval.to_phone} — decided by ${user.id}`
      : `${approval.subject} → ${approval.to_email} — decided by ${user.id}`,
  });

  return NextResponse.json({ ok: true, action: "approved" });
}
