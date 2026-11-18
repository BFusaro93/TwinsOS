import type { createClient } from "@supabase/supabase-js";
import { escapeHtml } from "@/lib/utils/escape-html";
import { Resend } from "resend";
import { EMAIL_FROM, sendEmailRetryingRateLimit } from "@/lib/email/send";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { shiftYmd, todayInZone } from "@/lib/time/zone";
import { logger } from "@/lib/logger";
import { isValidEmail } from "@/lib/utils/email";
import { normalizeAutomationPriority, normalizePOTriggerStatus } from "@/types/automation";

const log = logger.child("cmms-automations");

/**
 * The CMMS automation executor (automations table: meter/part/PM/WO/request/
 * PO triggers → create WO/MR/requisition, notify, email). Shared by
 * /api/automations/run (cron poll + in-app event mode) and by server code
 * that causes an event itself (submitWorkRequest), so "what happens" is the
 * same no matter which path fired the rule. Server-only: every caller passes
 * a service-role client and has already resolved the org.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AdminClient = ReturnType<typeof createClient<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AutomationRow = Record<string, any>;

// Trigger types that correspond to a discrete event (something was created,
// something's status changed) rather than a standing condition — these are
// fired directly by the code path that causes the event, not by polling.
export const EVENT_TRIGGER_TYPES = ["request_submitted", "wo_status_change", "po_status_change"] as const;
export type EventTriggerType = typeof EVENT_TRIGGER_TYPES[number];

/**
 * Event triggers raised only by trusted server code, never by a browser. Kept OUT
 * of EVENT_TRIGGER_TYPES on purpose: that list gates /api/automations/run's
 * client-callable event mode, and a signed-in user must not be able to fake a
 * vehicle fault code.
 */
export const SERVER_EVENT_TRIGGER_TYPES = ["vehicle_fault_code"] as const;
export type ServerEventTriggerType = typeof SERVER_EVENT_TRIGGER_TYPES[number];

/** What a fired event tells the action about itself (so a WO can name the fault). */
export interface EventDetail {
  /** Short label appended to the action's title, e.g. "P0457 — EVAP System Leak Detected". */
  title: string;
  /** Longer text for the created record's description / notification. */
  description: string;
  /** vehicle_fault_code: whether the check-engine light was on when the code appeared. */
  checkEngineLight?: boolean | null;
}

export const SUPPORTED_ACTION_TYPES = [
  "create_work_order",
  "create_wo_request",
  "create_requisition",
  "send_notification",
  "send_email",
];

export interface ActionContext {
  orgId: string;
  assetId?: string | null;
  assetName?: string | null;
  /** Whether assetId is an asset or a vehicle (work_orders.linked_entity_type). Omit to leave it unset. */
  linkedEntityType?: "asset" | "vehicle" | null;
  /** Event-specific text for the created record (see EventDetail). */
  detail?: EventDetail | null;
  /** The record this firing is about (per-record pm_due / wo_overdue), so a
   *  notification links to it. */
  entity?: { id: string; type: "work_order" | "pm_schedule" } | null;
  /** The user whose action fired this rule (event mode). Never notified of
   *  their own action — see send_notification. Null for cron / anonymous. */
  actorUserId?: string | null;
}

/**
 * Resolves an action's configured assignee. assigned_to_id is a
 * crm_employees.id (work_orders_assigned_to_id_fkey); it's re-verified as an
 * active employee of this org, and a stale id falls back to unassigned rather
 * than failing the insert on the FK. Legacy free text is kept as a name only.
 */
async function resolveAssignee(
  adminClient: AdminClient,
  orgId: string,
  ac: Record<string, unknown>
): Promise<{ id: string | null; name: string | null }> {
  const legacyName = (ac.assigned_to as string) || null;
  const configuredId = (ac.assigned_to_id as string) || null;
  if (!configuredId) return { id: null, name: legacyName };
  const { data: emp } = await adminClient
    .from("crm_employees")
    .select("id, first_name, last_name")
    .eq("id", configuredId)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!emp) return { id: null, name: legacyName };
  return { id: emp.id as string, name: `${emp.first_name} ${emp.last_name}`.trim() };
}

/**
 * What one action run did. `permanent` marks a skip that retrying can never fix
 * (an email recipient that isn't an address): the poll runner keeps its claim so
 * the rule doesn't retry every 15 minutes forever, and the failure is logged once.
 */
export type ActionOutcome = { result: string } | { skipReason: string; permanent?: boolean };

/**
 * Executes one automation's configured action. Shared by every trigger type
 * (polled or event-fired) so "what happens" is identical regardless of
 * "when it fires". Never throws: an unexpected error (a provider/network
 * failure) comes back as a retryable skip, so one rule can't abort a sweep
 * or the other rules of the same event.
 */
export async function executeAction(
  adminClient: AdminClient,
  auto: AutomationRow,
  ctx: ActionContext
): Promise<ActionOutcome> {
  try {
    const outcome = await runAction(adminClient, auto, ctx);
    if ("skipReason" in outcome && outcome.permanent) {
      log.error("automation action can never succeed as configured", {
        automationId: auto.id, orgId: ctx.orgId, actionType: auto.action_type, reason: outcome.skipReason,
      });
    }
    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("automation action threw", { automationId: auto.id, orgId: ctx.orgId, actionType: auto.action_type, error: message });
    return { skipReason: `action failed: ${message}` };
  }
}

async function runAction(
  adminClient: AdminClient,
  auto: AutomationRow,
  ctx: ActionContext
): Promise<ActionOutcome> {
  const ac = (auto.action_config ?? {}) as Record<string, unknown>;
  const baseTitle = (ac.title as string) ?? "Automated Work Order";
  // An event that knows what happened (a fault code) names it in the record's title.
  const acTitle = ctx.detail ? `${baseTitle} — ${ctx.detail.title}` : baseTitle;
  const orgId = ctx.orgId;

  // Validate the priority BEFORE a WO/MR number is allocated: an invalid one
  // (the dialog used to offer "urgent") failed the insert after burning the
  // number, every run. A saved "urgent" now means Critical.
  let acPriority = "medium";
  if (auto.action_type === "create_work_order" || auto.action_type === "create_wo_request") {
    const priority = normalizeAutomationPriority(ac.priority ?? "medium");
    if (!priority) return { skipReason: `invalid priority "${String(ac.priority)}" — edit the rule and pick a priority` };
    acPriority = priority;
  }

  if (auto.action_type === "create_work_order") {
    // Atomic per-org/year counter, not Date.now() — see next_work_order_number().
    const { data: workOrderNumber, error: woNumErr } = await adminClient.rpc("next_work_order_number", {
      p_org_id_override: orgId,
    });
    if (woNumErr || !workOrderNumber) return { skipReason: `failed to generate WO number: ${woNumErr?.message ?? "unknown"}` };
    // A cumulative meter rule is preventive maintenance by definition (an oil
    // change at N hours), and counts toward PM compliance as due 7 days after
    // the meter trips — see v_pm_outcomes. A level-meter "drops below" rule
    // (operator '<', e.g. low fuel) is a low-level alert, not PM.
    const triggerOperator = (auto.trigger_config as Record<string, unknown> | null)?.operator;
    const isMeterPM = auto.trigger_type === "meter_threshold" && triggerOperator !== "<";
    const meterDueDate = isMeterPM
      ? shiftYmd(todayInZone(await getOrgTimeZone(adminClient, orgId)), 7)
      : null;
    const { id: assigneeId, name: assigneeName } = await resolveAssignee(adminClient, orgId, ac);
    const { data: wo, error: woErr } = await adminClient
      .from("work_orders")
      .insert({
        org_id: orgId,
        title: acTitle,
        priority: acPriority,
        assigned_to_id: assigneeId,
        assigned_to_name: assigneeName,
        assigned_to_ids: assigneeId ? [assigneeId] : [],
        assigned_to_names: assigneeId && assigneeName ? [assigneeName] : [],
        status: "open",
        asset_id: ctx.assetId ?? null,
        asset_name: ctx.assetName?.trim() || null,
        work_order_number: workOrderNumber,
        automation_id: auto.id,
        is_recurring: false,
        ...(ctx.linkedEntityType && { linked_entity_type: ctx.linkedEntityType }),
        ...(ctx.detail && { description: ctx.detail.description }),
        ...(auto.trigger_type === "vehicle_fault_code" && { wo_type: "reactive" }),
        ...(isMeterPM && { wo_type: "preventive", due_date: meterDueDate }),
      })
      .select("id, work_order_number")
      .single();
    if (woErr || !wo) return { skipReason: `failed to create WO: ${woErr?.message ?? "unknown"}` };
    return { result: wo.work_order_number };
  }

  if (auto.action_type === "create_wo_request") {
    // Atomic per-org counter, same as the public submit path.
    const { data: requestNumber, error: numberErr } = await adminClient.rpc("next_entity_number", {
      p_entity_type: "maintenance_request",
      p_prefix: "MR",
      p_org_id_override: orgId,
    });
    if (numberErr || typeof requestNumber !== "string") {
      return { skipReason: `failed to allocate request number: ${numberErr?.message ?? "unknown"}` };
    }
    const { id: mrAssigneeId, name: mrAssigneeName } = await resolveAssignee(adminClient, orgId, ac);
    const { data: mr, error: mrErr } = await adminClient
      .from("maintenance_requests")
      .insert({
        org_id: orgId,
        request_number: requestNumber,
        title: acTitle,
        priority: acPriority,
        status: "open",
        asset_id: ctx.assetId ?? null,
        asset_name: ctx.assetName?.trim() || null,
        requested_by_name: "Automation",
        assigned_to_id: mrAssigneeId,
        assigned_to_name: mrAssigneeName,
        description: ctx.detail
          ? `${ctx.detail.description}\n\nAuto-generated by automation: ${auto.name}`
          : `Auto-generated by automation: ${auto.name}`,
        automation_id: auto.id,
      })
      .select("id, request_number")
      .single();
    if (mrErr || !mr) return { skipReason: `failed to create MR: ${mrErr?.message ?? "unknown"}` };

    try {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const { data: recipients } = await adminClient
          .from("profiles")
          .select("email, name, notification_prefs")
          .eq("org_id", orgId)
          .neq("status", "inactive")
          .in("role", ["admin", "manager"]);

        const eligible = (recipients ?? []).filter((p: { email: string | null; notification_prefs: Record<string, unknown> | null }) => {
          if (!p.email) return false;
          const prefs = (p.notification_prefs ?? {}) as Record<string, unknown>;
          return prefs["emailNewMaintenanceRequest"] !== false;
        });

        if (eligible.length > 0) {
          const resend = new Resend(resendKey);
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";
          const subject = `New maintenance request: ${acTitle}`;
          const link = `${siteUrl}/cmms/requests?id=${mr.id}`;
          // Sequential with a rate-limit retry — a parallel burst trips the
          // provider's 2 requests/second limit and the rejections resolve
          // silently, so managers past the second never got the email.
          for (const p of eligible as { email: string | null; name: string | null }[]) {
            try {
              await sendEmailRetryingRateLimit(resend, {
                from: EMAIL_FROM,
                to: p.email as string,
                subject,
                html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
                  <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">New Maintenance Request</h2>
                  <p style="margin:0 0 4px;color:#475569">Hi ${escapeHtml(p.name ?? "there")},</p>
                  <p style="margin:0 0 24px;color:#475569">Automation <strong>${escapeHtml(auto.name)}</strong> created: <strong>${escapeHtml(`${mr.request_number} — ${acTitle}`)}</strong>.</p>
                  <a href="${link}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Review Request</a>
                </div>`,
              });
            } catch {
              // Non-fatal — one recipient failing shouldn't block the others
            }
          }
        }
      }
    } catch {
      // best-effort — don't fail the automation run
    }
    return { result: mr.request_number };
  }

  if (auto.action_type === "create_requisition") {
    // Atomic per-org/year counter, not Date.now() — see next_requisition_number().
    const { data: requisitionNumber, error: reqNumErr } = await adminClient.rpc("next_requisition_number", {
      p_org_id_override: orgId,
    });
    if (reqNumErr || !requisitionNumber) return { skipReason: `failed to generate requisition number: ${reqNumErr?.message ?? "unknown"}` };
    const { data: req, error: reqErr } = await adminClient
      .from("requisitions")
      .insert({
        org_id: orgId,
        requisition_number: requisitionNumber,
        title: auto.name,
        status: "draft",
        requested_by_name: "Automation",
        notes: ((ac.notes as string) || `Auto-generated by automation: ${auto.name}`) +
          (ctx.detail ? `\n\n${ctx.assetName ? `${ctx.assetName}: ` : ""}${ctx.detail.description}` : ""),
      })
      .select("id, requisition_number")
      .single();
    if (reqErr || !req) return { skipReason: `failed to create requisition: ${reqErr?.message ?? "unknown"}` };
    return { result: req.requisition_number };
  }

  if (auto.action_type === "send_notification") {
    const recipientRole = (ac.recipient_role as string) ?? "all";
    const baseMessage = (ac.message as string) ?? `Automation "${auto.name}" triggered.`;
    const message = ctx.detail ? `${baseMessage} ${ctx.assetName ? `${ctx.assetName}: ` : ""}${ctx.detail.title}` : baseMessage;

    // Deactivated logins are never recipients (every other notifier excludes them);
    // "invited" users who haven't accepted yet stay in so the alert is waiting for them.
    let profileQuery = adminClient.from("profiles").select("id").eq("org_id", orgId).neq("status", "inactive");
    if (recipientRole !== "all") profileQuery = profileQuery.eq("role", recipientRole);
    // Never notify the actor about their own action.
    if (ctx.actorUserId) profileQuery = profileQuery.neq("id", ctx.actorUserId);

    const { data: profiles, error: profileErr } = await profileQuery;
    if (profileErr || !profiles?.length) {
      return { skipReason: `no profiles found for role "${recipientRole}"` };
    }

    const rows = profiles.map((p: { id: string }) => ({
      org_id: orgId,
      user_id: p.id,
      type: "automation_alert",
      title: "Automation Alert",
      message,
      entity_id: ctx.entity?.id ?? null,
      entity_type: ctx.entity?.type ?? null,
    }));
    const { error: notifErr } = await adminClient.from("notifications").insert(rows);
    if (notifErr) return { skipReason: `failed to insert notifications: ${notifErr.message}` };
    return { result: `notified ${profiles.length} user${profiles.length === 1 ? "" : "s"}` };
  }

  if (auto.action_type === "send_email") {
    const recipient = ((ac.recipient as string) ?? "").trim();
    if (!recipient) return { skipReason: "no recipient in action_config", permanent: true };
    // The dialog used to accept a name here; the provider rejects it on every try.
    if (!isValidEmail(recipient)) {
      return { skipReason: `email recipient "${recipient}" is not an email address — edit the rule`, permanent: true };
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return { skipReason: "RESEND_API_KEY not configured" };

    const fromEmail = process.env.FROM_EMAIL ?? "noreply@landscapt.com";
    const subject = `Automation triggered: ${auto.name}`;
    const detailText = ctx.detail ? `\n\n${ctx.assetName ? `${ctx.assetName}: ` : ""}${ctx.detail.description}` : "";
    const body = ((ac.message as string)
      ? `${ac.message as string}\n\nTriggered by automation: ${auto.name}`
      : `Automation "${auto.name}" was triggered.`) + detailText;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [recipient], subject, text: body }),
    });
    if (!emailRes.ok) {
      const errText = await emailRes.text();
      // 400/422 = the provider rejected this message itself (bad address/content):
      // resending the same rule can't succeed. 429 / 5xx are worth retrying.
      const permanent = emailRes.status === 400 || emailRes.status === 422;
      return { skipReason: `email send failed (${emailRes.status}): ${errText}`, permanent };
    }
    return { result: `email sent to ${recipient}` };
  }

  return { skipReason: `unsupported action_type: ${auto.action_type}` };
}

export interface EventFireResult {
  fired: { automationId: string; name: string; result: string }[];
  skipped: { automationId: string; reason: string }[];
}

/**
 * Fires every enabled automation of one event trigger type in one org.
 * `assetId` must already be verified as belonging to `orgId` by the caller.
 */
export async function fireEventAutomations(
  adminClient: AdminClient,
  params: {
    orgId: string;
    eventTrigger: EventTriggerType | ServerEventTriggerType;
    toStatus?: string | null;
    assetId?: string | null;
    assetName?: string | null;
    linkedEntityType?: "asset" | "vehicle" | null;
    detail?: EventDetail | null;
    actorUserId?: string | null;
  }
): Promise<EventFireResult> {
  const { orgId, eventTrigger, toStatus } = params;
  const { data: candidates } = await adminClient
    .from("automations")
    .select("*")
    .eq("trigger_type", eventTrigger)
    .eq("org_id", orgId)
    .eq("enabled", true)
    .in("action_type", SUPPORTED_ACTION_TYPES)
    .is("deleted_at", null);

  const fired: EventFireResult["fired"] = [];
  const skipped: EventFireResult["skipped"] = [];
  const now = new Date().toISOString();

  for (const auto of (candidates ?? []) as AutomationRow[]) {
    if (eventTrigger === "wo_status_change" || eventTrigger === "po_status_change") {
      const tc = (auto.trigger_config ?? {}) as Record<string, unknown>;
      // PO rules saved with the old names (pending_approval / closed) match the real
      // status; "draft" maps to nothing (POs have no draft), as before.
      const configured = eventTrigger === "po_status_change" ? normalizePOTriggerStatus(tc.to_status) : tc.to_status;
      if (configured !== toStatus) {
        skipped.push({ automationId: auto.id, reason: `toStatus "${toStatus}" doesn't match configured "${tc.to_status}"` });
        continue;
      }
    }

    if (eventTrigger === "vehicle_fault_code") {
      const tc = (auto.trigger_config ?? {}) as Record<string, unknown>;
      if (tc.only_check_engine_light === true && params.detail?.checkEngineLight !== true) {
        skipped.push({ automationId: auto.id, reason: "check-engine light is off and the rule only fires when it is on" });
        continue;
      }
    }

    const outcome = await executeAction(adminClient, auto, {
      orgId,
      assetId: params.assetId ?? null,
      assetName: params.assetId ? (params.assetName ?? null) : null,
      linkedEntityType: params.linkedEntityType ?? null,
      detail: params.detail ?? null,
      actorUserId: params.actorUserId ?? null,
    });
    if ("skipReason" in outcome) {
      skipped.push({ automationId: auto.id, reason: outcome.skipReason });
      continue;
    }

    await adminClient
      .from("automations")
      .update({ last_fired_at: now, updated_at: now })
      .eq("id", auto.id);
    fired.push({ automationId: auto.id, name: auto.name, result: outcome.result });
  }
  return { fired, skipped };
}
