import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import { processDueEnrollment } from "@/lib/automations/sequence-processor";
import { notifyZapierSubscribers } from "@/lib/integrations/zapier";
import { POLLING_TRIGGERS } from "@/lib/integrations/zapier-triggers";
import { logger } from "@/lib/logger";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { shiftYmd, todayInZone } from "@/lib/time/zone";
import {
  EVENT_TRIGGER_TYPES,
  SUPPORTED_ACTION_TYPES,
  executeAction,
  fireEventAutomations,
  type AdminClient,
} from "@/lib/automations/cmms-automation-actions";

const log = logger.child("crm-processor");


// Trigger types evaluated by polling current state on every run (meter
// value, stock level, due dates) — each needs the fire-once/reset-on-clear
// gating below since the underlying condition can stay true for days.
const POLL_TRIGGER_TYPES = ["meter_threshold", "part_low_stock", "pm_due", "wo_overdue"] as const;
// Event trigger types (EVENT_TRIGGER_TYPES) are fired via the eventTrigger
// body param below, or directly by server code (submitWorkRequest).

// Meter rules whose action creates a request/WO wait on it (pending_reset)
// and are released by release_meter_automation_firing(). Every other action
// (notify, email, requisition) has nothing to wait on, so the runner
// advances the threshold itself the moment it fires.
const METER_WAITING_ACTIONS = ["create_work_order", "create_wo_request"];

/** trigger_config.interval as a positive number, or null. */
function meterInterval(tc: Record<string, unknown>): number | null {
  const n = Number(tc.interval);
  return tc.interval != null && tc.interval !== "" && Number.isFinite(n) && n > 0 ? n : null;
}


/** True if ANY part matching the automation's configured name (or "any") is
 *  at or below its minimum stock. A single automation only tracks one
 *  pending_reset flag, so — same tradeoff as meter_threshold — "any" mode
 *  fires once when at least one part goes low and won't re-fire until EVERY
 *  part has recovered above its minimum, rather than tracking each part's
 *  state individually. */
async function evaluatePartLowStock(adminClient: AdminClient, orgId: string, partName: string): Promise<boolean> {
  let q = adminClient
    .from("parts")
    .select("id, quantity_on_hand, minimum_stock")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .eq("is_inventory", true)
    .gt("minimum_stock", 0);
  // Escape LIKE metacharacters so the configured name matches literally
  // (case-insensitively) instead of acting as a pattern.
  if (partName && partName !== "any") q = q.ilike("name", partName.replace(/[\\%_]/g, "\\$&"));
  const { data } = await q;
  return (data ?? []).some((p: { quantity_on_hand: number; minimum_stock: number }) => p.quantity_on_hand <= p.minimum_stock);
}

/** True if any active PM schedule is due within daysAhead days. */
async function evaluatePmDue(adminClient: AdminClient, orgId: string, daysAhead: number): Promise<boolean> {
  // next_due_date is a calendar date in the org's zone — compare against the
  // org's today, not UTC's (which is already tomorrow after ~8pm ET).
  const cutoff = shiftYmd(todayInZone(await getOrgTimeZone(adminClient, orgId)), daysAhead);
  const { data } = await adminClient
    .from("pm_schedules")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .lte("next_due_date", cutoff);
  if (!data || data.length === 0) return false;
  // Paused (off-season) schedules owe nothing.
  const { data: paused } = await adminClient
    .from("v_pm_schedule_pause_state")
    .select("pm_schedule_id")
    .eq("org_id", orgId)
    .eq("paused_today", true);
  const pausedIds = new Set((paused ?? []).map((p: { pm_schedule_id: string }) => p.pm_schedule_id));
  return data.some((s: { id: string }) => !pausedIds.has(s.id));
}

/** True if any open work order's due date is more than daysOverdue days in the past. */
async function evaluateWoOverdue(adminClient: AdminClient, orgId: string, daysOverdue: number): Promise<boolean> {
  // due_date is a calendar date in the org's zone (see evaluatePmDue).
  const cutoff = shiftYmd(todayInZone(await getOrgTimeZone(adminClient, orgId)), -daysOverdue);
  const { data } = await adminClient
    .from("work_orders")
    .select("id")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .not("status", "in", '("done","skipped")')
    .not("due_date", "is", null)
    .lte("due_date", cutoff)
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * GET  /api/automations/run — called by Vercel Cron (GET only), polls every
 *      standing-condition trigger type (meter/part-stock/PM-due/WO-overdue).
 * POST /api/automations/run — two modes:
 *   1. No body (or no eventTrigger key) — same poll sweep as GET, for an
 *      authenticated admin triggering manually.
 *   2. { eventTrigger, ... } — fires only automations of that ONE event
 *      trigger type, called by the app itself right after the event
 *      happens (a maintenance request created, a WO/PO status changed).
 */
export async function GET(request: Request) {
  return handleRun(request);
}

export async function POST(request: Request) {
  return handleRun(request);
}

async function handleRun(request: Request) {
  const adminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization") ?? "";
  const isCron =
    process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  let callerOrgId: string | null = null;
  let callerUserId: string | null = null;

  if (!isCron) {
    const userClient = await createServerClient();
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: profile } = await userClient
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }
    callerOrgId = profile.org_id;
    callerUserId = user.id;
  }

  // ── Event-fired mode ──────────────────────────────────────────────────────
  // Only reachable via POST from an authenticated (non-cron) caller — the app
  // calls this right after the triggering event, scoped to the caller's own org.
  if (request.method === "POST") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any = {};
    try { body = await request.json(); } catch { /* no/invalid body — fall through to poll mode */ }

    if (body?.eventTrigger && (EVENT_TRIGGER_TYPES as readonly string[]).includes(body.eventTrigger)) {
      if (!callerOrgId) {
        return NextResponse.json({ error: "Event-fired automations require an authenticated caller" }, { status: 401 });
      }
      const { eventTrigger, toStatus, assetId, assetName, workOrderId, purchaseOrderId } = body as {
        eventTrigger: typeof EVENT_TRIGGER_TYPES[number];
        toStatus?: string;
        assetId?: string | null;
        assetName?: string | null;
        workOrderId?: string | null;
        purchaseOrderId?: string | null;
      };

      // assetId is a caller-supplied foreign key written directly onto the new
      // work_orders/maintenance_requests row's asset_id column — verify it
      // actually belongs to the caller's org before trusting it, same as
      // workOrderId/purchaseOrderId below, so a crafted request can't link a
      // newly created row to another org's asset.
      // The id may be an asset OR a vehicle (work_orders.asset_id is
      // polymorphic), so either table can vouch for it.
      let verifiedAssetId: string | null = null;
      if (assetId) {
        const [{ data: asset }, { data: vehicle }] = await Promise.all([
          (adminClient as AdminClient)
            .from("assets")
            .select("id")
            .eq("id", assetId)
            .eq("org_id", callerOrgId)
            .maybeSingle(),
          (adminClient as AdminClient)
            .from("vehicles")
            .select("id")
            .eq("id", assetId)
            .eq("org_id", callerOrgId)
            .maybeSingle(),
        ]);
        verifiedAssetId = asset || vehicle ? assetId : null;
      }

      // Fan out to any Zapier REST Hook subscriptions for the CMMS trigger
      // types that piggyback on this same event round-trip — best-effort,
      // independent of whether any internal automation matched below.
      if (eventTrigger === "wo_status_change" && toStatus === "done" && workOrderId) {
        const config = POLLING_TRIGGERS.work_order_completed;
        const { data: wo } = await (adminClient as AdminClient)
          .from("work_orders")
          .select(config.columns)
          .eq("id", workOrderId)
          .eq("org_id", callerOrgId)
          .maybeSingle();
        if (wo) await notifyZapierSubscribers(adminClient, callerOrgId, "work_order_completed", config.map(wo));
      }
      if (eventTrigger === "po_status_change" && toStatus === "approved" && purchaseOrderId) {
        const config = POLLING_TRIGGERS.po_approved;
        const { data: po } = await (adminClient as AdminClient)
          .from("purchase_orders")
          .select(config.columns)
          .eq("id", purchaseOrderId)
          .eq("org_id", callerOrgId)
          .maybeSingle();
        if (po) await notifyZapierSubscribers(adminClient, callerOrgId, "po_approved", config.map(po));
      }

      const { fired, skipped } = await fireEventAutomations(adminClient as AdminClient, {
        orgId: callerOrgId,
        eventTrigger,
        toStatus: toStatus ?? null,
        assetId: verifiedAssetId,
        assetName: assetName ?? null,
        // The caller's own action fired these — never notify them about it.
        actorUserId: callerUserId,
      });

      return NextResponse.json({ fired: fired.length, skipped: skipped.length, details: { fired, skipped } });
    }
  }

  // ── Poll sweep (meter_threshold, part_low_stock, pm_due, wo_overdue) ───────
  let autoQuery = (adminClient as AdminClient)
    .from("automations")
    .select("*")
    .in("trigger_type", POLL_TRIGGER_TYPES)
    .in("action_type", SUPPORTED_ACTION_TYPES)
    .eq("enabled", true)
    .is("deleted_at", null);

  if (callerOrgId) {
    autoQuery = autoQuery.eq("org_id", callerOrgId);
  }

  const { data: automations, error: autoErr } = await autoQuery;
  if (autoErr) {
    return NextResponse.json({ error: autoErr.message }, { status: 500 });
  }

  const fired: { automationId: string; name: string; result: string }[] = [];
  const skipped: { automationId: string; reason: string }[] = [];
  const now = new Date().toISOString();

  for (const auto of automations ?? []) {
    const tc = (auto.trigger_config ?? {}) as Record<string, unknown>;
    const orgId = auto.org_id as string;

    if (auto.trigger_type === "meter_threshold") {
      const meterId = tc.meter_id as string | undefined;
      const threshold = Number(tc.threshold ?? 0);
      const operator = (tc.operator as string | undefined) ?? ">=";

      if (!meterId) {
        skipped.push({ automationId: auto.id, reason: "no meter_id in trigger_config" });
        continue;
      }

      const { data: meter, error: meterErr } = await (adminClient as AdminClient)
        .from("meters")
        .select("id, current_value, asset_id, asset_name, org_id")
        .eq("id", meterId)
        // meter_id comes from the rule's own trigger_config (user-editable
        // JSON) and this runs on the service-role client — never read another
        // org's meter.
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .single();
      if (meterErr || !meter) {
        skipped.push({ automationId: auto.id, reason: "meter not found" });
        continue;
      }

      const currentValue = Number(meter.current_value ?? 0);
      const triggered = operator === ">=" ? currentValue >= threshold : currentValue <= threshold;

      // ── Notify / email / requisition rules on a rising (>=) meter ────────
      // These create nothing the release trigger could wait on, and a meter
      // never drops back below the threshold, so the old "fire, set
      // pending_reset, wait" gating made them fire exactly once, forever.
      // Instead the firing itself moves the threshold on by the service
      // interval (from the reading that fired it — the same rule
      // release_meter_automation_firing() applies to a completed WO). A rule
      // with no interval has no next threshold, so it fires once and is
      // switched off rather than left looking enabled. (<= rules keep the
      // wait-until-clear gating below: their condition does clear.)
      if (operator === ">=" && !METER_WAITING_ACTIONS.includes(auto.action_type as string)) {
        const interval = meterInterval(tc);

        // Rules that fired before this change are still parked on
        // pending_reset. Release them without firing: advance past the
        // reading that fired them, or switch off a rule with no interval.
        if (auto.pending_reset) {
          const firedAt = auto.last_fired_value != null ? Number(auto.last_fired_value) : threshold;
          await (adminClient as AdminClient)
            .from("automations")
            .update(
              interval != null
                ? { trigger_config: { ...tc, threshold: firedAt + interval }, pending_reset: false, updated_at: now }
                : { pending_reset: false, enabled: false, updated_at: now }
            )
            .eq("id", auto.id)
            .eq("org_id", orgId)
            .eq("pending_reset", true);
          skipped.push({
            automationId: auto.id,
            reason: interval != null
              ? `released legacy firing; threshold advanced to ${firedAt + interval}`
              : "released legacy firing; no service interval, so the rule was disabled",
          });
          continue;
        }

        if (!triggered) {
          skipped.push({ automationId: auto.id, reason: `meter value ${currentValue} does not satisfy ${operator} ${threshold}` });
          continue;
        }

        // Claim by advancing the threshold, conditioned on last_fired_at
        // being what we read, so two overlapping runs can't both fire.
        let claimQuery = (adminClient as AdminClient)
          .from("automations")
          .update({
            last_fired_at: now,
            last_fired_value: currentValue,
            trigger_config: interval != null ? { ...tc, threshold: currentValue + interval } : tc,
            ...(interval == null && { enabled: false }),
            updated_at: now,
          })
          .eq("id", auto.id)
          .eq("org_id", orgId)
          .eq("pending_reset", false);
        claimQuery = auto.last_fired_at
          ? claimQuery.eq("last_fired_at", auto.last_fired_at)
          : claimQuery.is("last_fired_at", null);
        const { data: advClaimed, error: advClaimErr } = await claimQuery.select("id");
        if (advClaimErr) {
          skipped.push({ automationId: auto.id, reason: `couldn't claim firing: ${advClaimErr.message}` });
          continue;
        }
        if (!advClaimed || advClaimed.length === 0) {
          skipped.push({ automationId: auto.id, reason: "already fired by a concurrent run" });
          continue;
        }

        const advOutcome = await executeAction(adminClient as AdminClient, auto, {
          orgId, assetId: meter.asset_id ?? null, assetName: meter.asset_name ?? null,
        });
        if ("skipReason" in advOutcome) {
          // Nothing happened — put the threshold back so the next run retries.
          await (adminClient as AdminClient)
            .from("automations")
            .update({
              trigger_config: tc,
              enabled: true,
              last_fired_at: auto.last_fired_at ?? null,
              last_fired_value: auto.last_fired_value ?? null,
              updated_at: now,
            })
            .eq("id", auto.id)
            .eq("last_fired_at", now);
          skipped.push({ automationId: auto.id, reason: advOutcome.skipReason });
          continue;
        }
        fired.push({ automationId: auto.id, name: auto.name, result: advOutcome.result });
        continue;
      }

      if (!triggered) {
        if (auto.pending_reset) {
          await (adminClient as AdminClient).from("automations").update({ pending_reset: false, updated_at: now }).eq("id", auto.id);
        }
        skipped.push({ automationId: auto.id, reason: `meter value ${currentValue} does not satisfy ${operator} ${threshold}` });
        continue;
      }
      if (auto.pending_reset) {
        skipped.push({ automationId: auto.id, reason: "already fired, waiting for its request/work order to be resolved" });
        continue;
      }

      // Claim the firing BEFORE acting: a conditional update that only one
      // concurrent run (two readings saved at once, or the cron racing a
      // reading) can win, so a threshold crossing creates exactly one
      // request/WO. last_fired_at is stamped here, before the WO exists,
      // which is what the release trigger's "latest firing" check expects.
      const { data: claimed, error: claimErr } = await (adminClient as AdminClient)
        .from("automations")
        .update({ last_fired_at: now, last_fired_value: currentValue, pending_reset: true, updated_at: now })
        .eq("id", auto.id)
        .eq("org_id", orgId)
        .eq("pending_reset", false)
        .select("id");
      if (claimErr) {
        skipped.push({ automationId: auto.id, reason: `couldn't claim firing: ${claimErr.message}` });
        continue;
      }
      if (!claimed || claimed.length === 0) {
        skipped.push({ automationId: auto.id, reason: "already fired by a concurrent run" });
        continue;
      }

      const outcome = await executeAction(adminClient as AdminClient, auto, {
        orgId, assetId: meter.asset_id ?? null, assetName: meter.asset_name ?? null,
      });
      if ("skipReason" in outcome) {
        // Nothing was created — give the claim back so the next run retries.
        await (adminClient as AdminClient)
          .from("automations")
          .update({
            pending_reset: false,
            last_fired_at: auto.last_fired_at ?? null,
            last_fired_value: auto.last_fired_value ?? null,
            updated_at: now,
          })
          .eq("id", auto.id)
          .eq("last_fired_at", now);
        skipped.push({ automationId: auto.id, reason: outcome.skipReason });
        continue;
      }
      fired.push({ automationId: auto.id, name: auto.name, result: outcome.result });
      continue;
    }

    // part_low_stock / pm_due / wo_overdue — all use the same fire-once /
    // clear-on-resolve gating as meter_threshold above, just with a
    // different condition check and no asset context.
    let triggered: boolean;
    let notMetReason: string;
    // use-automations.ts saves these keys snake_case (part_name, days_ahead,
    // days_overdue); the camelCase reads here never matched, so every rule
    // ran on the defaults. Read both.
    if (auto.trigger_type === "part_low_stock") {
      triggered = await evaluatePartLowStock(adminClient as AdminClient, orgId, ((tc.part_name ?? tc.partName) as string | undefined) ?? "any");
      notMetReason = "no matching part is at or below its minimum stock";
    } else if (auto.trigger_type === "pm_due") {
      triggered = await evaluatePmDue(adminClient as AdminClient, orgId, Number(tc.days_ahead ?? tc.daysAhead ?? 7));
      notMetReason = "no active PM schedule is due within the configured window";
    } else if (auto.trigger_type === "wo_overdue") {
      triggered = await evaluateWoOverdue(adminClient as AdminClient, orgId, Number(tc.days_overdue ?? tc.daysOverdue ?? 1));
      notMetReason = "no open work order is overdue by the configured amount";
    } else {
      skipped.push({ automationId: auto.id, reason: `unsupported poll trigger_type: ${auto.trigger_type}` });
      continue;
    }

    if (!triggered) {
      if (auto.pending_reset) {
        await (adminClient as AdminClient).from("automations").update({ pending_reset: false, updated_at: now }).eq("id", auto.id);
      }
      skipped.push({ automationId: auto.id, reason: notMetReason });
      continue;
    }
    if (auto.pending_reset) {
      skipped.push({ automationId: auto.id, reason: "already fired, waiting for condition to clear" });
      continue;
    }

    // Claim the firing BEFORE acting so overlapping runs can't both fire.
    const { data: pollClaimed, error: pollClaimErr } = await (adminClient as AdminClient)
      .from("automations")
      .update({ last_fired_at: now, pending_reset: true, updated_at: now })
      .eq("id", auto.id)
      .eq("org_id", orgId)
      .eq("pending_reset", false)
      .select("id");
    if (pollClaimErr) {
      skipped.push({ automationId: auto.id, reason: `couldn't claim firing: ${pollClaimErr.message}` });
      continue;
    }
    if (!pollClaimed || pollClaimed.length === 0) {
      skipped.push({ automationId: auto.id, reason: "already fired by a concurrent run" });
      continue;
    }

    const outcome = await executeAction(adminClient as AdminClient, auto, { orgId });
    if ("skipReason" in outcome) {
      // Nothing happened — give the claim back so the next run retries.
      await (adminClient as AdminClient)
        .from("automations")
        .update({ pending_reset: false, last_fired_at: auto.last_fired_at ?? null, updated_at: now })
        .eq("id", auto.id)
        .eq("last_fired_at", now);
      skipped.push({ automationId: auto.id, reason: outcome.skipReason });
      continue;
    }
    fired.push({ automationId: auto.id, name: auto.name, result: outcome.result });
  }

  // ── CRM sequence enrollment processor ────────────────────────────────────
  const crmFired: { enrollmentId: string; action: string }[] = [];
  const crmSkipped: { enrollmentId: string; reason: string }[] = [];

  try {
    const nowIso = new Date().toISOString();

    let enrollQuery = (adminClient as AdminClient)
      .from("crm_sequence_enrollments")
      .select("id, org_id, sequence_id, client_id, estimate_id, ticket_id, invoice_id, meeting_id, next_event_position, organizations!inner(plan)")
      // A canceled org is read-only: its automations pause (and resume if it
      // resubscribes). Filtered here so its due rows can't crowd the batch.
      .neq("organizations.plan", "canceled")
      .lte("next_fire_at", nowIso)
      .is("completed_at", null)
      .is("stopped_at", null)
      .is("deleted_at", null)
      .eq("awaiting_approval", false)
      // Oldest-due first. With no ORDER BY Postgres returned an arbitrary
      // (in practice stable) 50, so a backlog of rows that kept failing
      // could starve everything behind them. Each row is still claimed
      // atomically inside processDueEnrollment, so an overlapping run (or
      // an immediate post-enrollment run) can't double-send it.
      .order("next_fire_at", { ascending: true })
      .limit(50);

    if (callerOrgId) {
      enrollQuery = enrollQuery.eq("org_id", callerOrgId);
    }

    const { data: enrollments, error: enrollErr } = await enrollQuery;
    if (enrollErr) {
      log.error("enrollment query error", { error: enrollErr.message });
    }

    for (const enrollment of enrollments ?? []) {
      const outcome = await processDueEnrollment(adminClient, enrollment);
      if ("fired" in outcome) {
        crmFired.push(outcome.fired);
      } else {
        crmSkipped.push(outcome.skipped);
      }
    }
  } catch (crmErr) {
    log.error("fatal error", { error: crmErr instanceof Error ? crmErr.message : String(crmErr) });
  }

  return NextResponse.json({
    fired: fired.length,
    skipped: skipped.length,
    details: { fired, skipped },
    crm: { fired: crmFired.length, skipped: crmSkipped.length, details: { fired: crmFired, skipped: crmSkipped } },
  });
}
