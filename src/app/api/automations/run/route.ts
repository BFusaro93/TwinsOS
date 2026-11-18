import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import { processDueEnrollment } from "@/lib/automations/sequence-processor";
import { drainTriggerQueue } from "@/lib/automations/trigger-queue";
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
  type EventDetail,
} from "@/lib/automations/cmms-automation-actions";
import { createOrgCanceledResolver } from "@/lib/orgs/org-canceled";
import { plansWithoutModule } from "@/lib/stripe/plans";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";

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

/** One record a per-record poll rule (pm_due / wo_overdue) may fire for. */
interface PollRecord {
  recordType: "pm_schedule" | "work_order";
  recordId: string;
  /** What makes a firing distinct: a schedule's next_due_date (re-arms when it advances); "" = once per record. */
  recordKey: string;
  assetId: string | null;
  assetName: string | null;
  linkedEntityType: "asset" | "vehicle" | null;
  detail: EventDetail;
}

/** Most records one rule acts on per run, so a first run over a large backlog stays bounded;
 *  the rest fire on the following runs. */
const MAX_RECORDS_PER_RULE_PER_RUN = 25;

/** Active, unpaused PM schedules due within daysAhead days (or overdue), oldest due first. */
async function duePmScheduleRecords(adminClient: AdminClient, orgId: string, daysAhead: number): Promise<PollRecord[]> {
  // next_due_date is a calendar date in the org's zone — compare against the
  // org's today, not UTC's (which is already tomorrow after ~8pm ET).
  const cutoff = shiftYmd(todayInZone(await getOrgTimeZone(adminClient, orgId)), daysAhead);
  const { data, error } = await adminClient
    .from("pm_schedules")
    .select("id, title, asset_id, asset_name, next_due_date")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .not("next_due_date", "is", null)
    .lte("next_due_date", cutoff)
    .order("next_due_date", { ascending: true })
    .limit(1000);
  if (error) throw new Error(`pm_schedules query failed: ${error.message}`);
  if (!data || data.length === 0) return [];
  // Paused (off-season) schedules owe nothing.
  const { data: paused } = await adminClient
    .from("v_pm_schedule_pause_state")
    .select("pm_schedule_id")
    .eq("org_id", orgId)
    .eq("paused_today", true);
  const pausedIds = new Set((paused ?? []).map((p: { pm_schedule_id: string }) => p.pm_schedule_id));
  const due = (data as { id: string; title: string | null; asset_id: string | null; asset_name: string | null; next_due_date: string }[])
    .filter((sch) => !pausedIds.has(sch.id));

  // A multi-asset schedule keeps its assets in pm_schedule_assets; name them when the
  // schedule row has no single asset.
  const noAsset = due.filter((sch) => !sch.asset_id).map((sch) => sch.id);
  const extraAssets = new Map<string, { id: string; name: string | null }[]>();
  if (noAsset.length > 0) {
    const { data: links } = await adminClient
      .from("pm_schedule_assets")
      .select("pm_schedule_id, asset_id, asset_name")
      .in("pm_schedule_id", noAsset)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    for (const l of (links ?? []) as { pm_schedule_id: string; asset_id: string; asset_name: string | null }[]) {
      const list = extraAssets.get(l.pm_schedule_id) ?? [];
      list.push({ id: l.asset_id, name: l.asset_name });
      extraAssets.set(l.pm_schedule_id, list);
    }
  }

  return due.map((sch) => {
    const title = sch.title?.trim() || "PM schedule";
    const linked = extraAssets.get(sch.id) ?? [];
    const assetId = sch.asset_id ?? (linked.length === 1 ? linked[0].id : null);
    const assetName = sch.asset_name?.trim() || (linked.length > 0 ? linked.map((a) => a.name).filter(Boolean).join(", ") : null) || null;
    return {
      recordType: "pm_schedule" as const,
      recordId: sch.id,
      recordKey: sch.next_due_date,
      assetId,
      assetName,
      linkedEntityType: null,
      detail: {
        title: `${title} (due ${sch.next_due_date})`,
        description: `PM schedule "${title}"${assetName ? ` for ${assetName}` : ""} is due ${sch.next_due_date}.`,
      },
    };
  });
}

/** Open work orders whose due date is more than daysOverdue days past, oldest due first. */
async function overdueWorkOrderRecords(adminClient: AdminClient, orgId: string, daysOverdue: number): Promise<PollRecord[]> {
  // due_date is a calendar date in the org's zone (see duePmScheduleRecords).
  const cutoff = shiftYmd(todayInZone(await getOrgTimeZone(adminClient, orgId)), -daysOverdue);
  const { data, error } = await adminClient
    .from("work_orders")
    .select("id, work_order_number, title, asset_id, asset_name, linked_entity_type, due_date")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .not("status", "in", '("done","skipped")')
    .not("due_date", "is", null)
    .lte("due_date", cutoff)
    .order("due_date", { ascending: true })
    .limit(1000);
  if (error) throw new Error(`work_orders query failed: ${error.message}`);
  return ((data ?? []) as {
    id: string; work_order_number: string | null; title: string | null; asset_id: string | null;
    asset_name: string | null; linked_entity_type: string | null; due_date: string;
  }[]).map((wo) => {
    const label = [wo.work_order_number, wo.title?.trim()].filter(Boolean).join(" ") || "Work order";
    return {
      recordType: "work_order" as const,
      recordId: wo.id,
      recordKey: "",
      assetId: wo.asset_id,
      assetName: wo.asset_name?.trim() || null,
      linkedEntityType: wo.linked_entity_type === "vehicle" || wo.linked_entity_type === "asset" ? wo.linked_entity_type : null,
      detail: {
        title: `${label} (overdue since ${wo.due_date})`,
        description: `Work order ${label} was due ${wo.due_date} and is still open.`,
      },
    };
  });
}

/**
 * Fires one rule once per record it hasn't fired for yet: claims the (rule, record, key)
 * row first (claim_automation_record_firing — so overlapping runs can't both act), runs
 * the action with that record's asset/detail, then marks the row fired, or failed (so the
 * next run retries). A permanent failure (e.g. a bad email address) is marked fired so it
 * isn't retried every run; executeAction logs it.
 */
async function firePerRecord(
  adminClient: AdminClient,
  auto: Record<string, unknown> & { id: string; name: string },
  orgId: string,
  records: PollRecord[]
): Promise<{ fired: { automationId: string; name: string; result: string }[]; skipped: { automationId: string; reason: string }[] }> {
  const fired: { automationId: string; name: string; result: string }[] = [];
  const skipped: { automationId: string; reason: string }[] = [];
  if (records.length === 0) {
    skipped.push({ automationId: auto.id, reason: auto.trigger_type === "pm_due"
      ? "no active PM schedule is due within the configured window"
      : "no open work order is overdue by the configured amount" });
    return { fired, skipped };
  }

  // Skip records this rule already fired for (one read, not a claim attempt per record).
  // Chunked so the id list stays well inside the request-URL limit.
  const recordType = records[0].recordType;
  const done: { record_id: string; record_key: string; status: string; claimed_at: string }[] = [];
  const ids = records.map((r) => r.recordId);
  for (let k = 0; k < ids.length; k += 150) {
    const { data, error: doneErr } = await adminClient
      .from("automation_record_firings")
      .select("record_id, record_key, status, claimed_at")
      .eq("automation_id", auto.id)
      .eq("record_type", recordType)
      .in("record_id", ids.slice(k, k + 150));
    if (doneErr) throw new Error(`firing log query failed: ${doneErr.message}`);
    done.push(...((data ?? []) as typeof done));
  }
  // Failed firings, and claims abandoned by a run that died (>10 min, same rule as the
  // claim RPC), are retried.
  const staleBefore = Date.now() - 10 * 60_000;
  const settled = new Set(
    done
      .filter((d) => d.status === "fired" || (d.status === "claimed" && new Date(d.claimed_at).getTime() >= staleBefore))
      .map((d) => `${d.record_id}|${d.record_key}`)
  );
  const pending = records.filter((r) => !settled.has(`${r.recordId}|${r.recordKey}`));
  if (pending.length === 0) {
    skipped.push({ automationId: auto.id, reason: "already fired for every due record" });
    return { fired, skipped };
  }

  for (const rec of pending.slice(0, MAX_RECORDS_PER_RULE_PER_RUN)) {
    const { data: firingId, error: claimErr } = await adminClient.rpc("claim_automation_record_firing", {
      p_automation_id: auto.id,
      p_record_type: rec.recordType,
      p_record_id: rec.recordId,
      p_record_key: rec.recordKey,
    });
    if (claimErr) {
      skipped.push({ automationId: auto.id, reason: `couldn't claim firing: ${claimErr.message}` });
      continue;
    }
    if (!firingId) continue; // another run has it, or it already fired

    const outcome = await executeAction(adminClient, auto, {
      orgId,
      assetId: rec.assetId,
      assetName: rec.assetName,
      linkedEntityType: rec.linkedEntityType,
      detail: rec.detail,
      entity: { id: rec.recordId, type: rec.recordType },
    });
    const now = new Date().toISOString();
    const succeeded = !("skipReason" in outcome);
    const consumed = succeeded || ("skipReason" in outcome && outcome.permanent === true);
    await adminClient
      .from("automation_record_firings")
      .update({
        status: consumed ? "fired" : "failed",
        result: "skipReason" in outcome ? `not done: ${outcome.skipReason}` : outcome.result,
        fired_at: consumed ? now : null,
        updated_at: now,
      })
      .eq("id", firingId as string);
    if ("skipReason" in outcome) {
      skipped.push({ automationId: auto.id, reason: outcome.skipReason });
      continue;
    }
    await adminClient.from("automations").update({ last_fired_at: now, updated_at: now }).eq("id", auto.id);
    fired.push({ automationId: auto.id, name: auto.name, result: outcome.result });
  }
  return { fired, skipped };
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
// The poll loop below works through a 240s time budget.
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleRun(request);
}

export async function POST(request: Request) {
  return handleRun(request);
}

/** Work this run may start, measured from the start of the request: maxDuration is 300s,
 *  and a step already being sent (provider call, then its sent-marker write) needs headroom
 *  to finish before the platform kills the function. */
const RUN_BUDGET_MS = 240_000;

async function handleRun(request: Request) {
  const requestStartedAt = Date.now();
  const remainingMs = () => RUN_BUDGET_MS - (Date.now() - requestStartedAt);
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
      const { eventTrigger, toStatus, assetId, assetName, workOrderId, purchaseOrderId, requestId } = body as {
        eventTrigger: typeof EVENT_TRIGGER_TYPES[number];
        toStatus?: string;
        assetId?: string | null;
        assetName?: string | null;
        workOrderId?: string | null;
        purchaseOrderId?: string | null;
        /** request_submitted: the maintenance request just created. */
        requestId?: string | null;
      };

      // The app fires this once per status change, but nothing stops a member replaying the
      // same POST — every replay would send the rule's email / raise another requisition or
      // work order. Allow a couple of repeats (a legitimate reopen-and-redo) per record per
      // status per user, then refuse. (request_submitted is keyed on its request — it used to
      // fall back to the asset or "none", so a 4th request in 10 minutes was silently dropped.)
      const eventRecordId =
        (eventTrigger === "request_submitted" ? requestId : null) ?? workOrderId ?? purchaseOrderId ?? assetId ?? "none";
      if (!(await checkAuthRateLimit(`auto-event:${callerUserId}:${eventTrigger}:${toStatus ?? ""}:${eventRecordId}`, 3, 600))) {
        return NextResponse.json({ error: "This event was already processed — try again in a few minutes" }, { status: 429 });
      }

      // assetId is a caller-supplied foreign key written directly onto the new
      // work_orders/maintenance_requests row's asset_id column — verify it
      // actually belongs to the caller's org before trusting it, same as
      // workOrderId/purchaseOrderId below, so a crafted request can't link a
      // newly created row to another org's asset.
      // The id may be an asset OR a vehicle (work_orders.asset_id is
      // polymorphic), so either table can vouch for it.
      let verifiedAssetId: string | null = null;
      let eventAssetName: string | null = assetName ?? null;
      if (assetId && eventTrigger !== "request_submitted") {
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

      // The event was asserted by the caller; prove it from the record so a
      // viewer/crew login can't fire "WO done"/"PO approved" automations (which
      // create work orders, requisitions and emails) without the change having
      // happened. Same idea as fire-trigger's VERIFIED_TRIGGERS.
      if (eventTrigger === "wo_status_change" || eventTrigger === "po_status_change") {
        const table = eventTrigger === "wo_status_change" ? "work_orders" : "purchase_orders";
        const recordId = eventTrigger === "wo_status_change" ? workOrderId : purchaseOrderId;
        if (!recordId || !toStatus) {
          return NextResponse.json({ error: "Record id and toStatus are required" }, { status: 400 });
        }
        const { data: rec } = await (adminClient as AdminClient)
          .from(table)
          .select("status, updated_at")
          .eq("id", recordId)
          .eq("org_id", callerOrgId)
          .maybeSingle();
        if (!rec || (rec as { status: string | null }).status !== toStatus) {
          return NextResponse.json({ error: "Record is not in that status" }, { status: 409 });
        }
        // One firing per actual PO status write, whoever reports it: the approval
        // RPC callers, the status menu and the receipt refresh can each post the same
        // transition, and a second tab could too. updated_at moves on every write, so a
        // later real transition into the same status still fires.
        if (eventTrigger === "po_status_change") {
          const updatedAt = (rec as { updated_at?: string | null }).updated_at ?? "";
          if (!(await checkAuthRateLimit(`auto-event:po:${recordId}:${toStatus}:${updatedAt}`, 1, 86_400))) {
            return NextResponse.json({ fired: 0, skipped: 0, duplicate: true });
          }
        }
      }

      // request_submitted: prove the request exists in the caller's org (it used to be
      // taken on trust), fire once per request, and take the asset from the request row.
      if (eventTrigger === "request_submitted") {
        if (!requestId) {
          return NextResponse.json({ error: "requestId is required" }, { status: 400 });
        }
        const { data: mr } = await (adminClient as AdminClient)
          .from("maintenance_requests")
          .select("id, asset_id, asset_name")
          .eq("id", requestId)
          .eq("org_id", callerOrgId)
          .is("deleted_at", null)
          .maybeSingle();
        if (!mr) {
          return NextResponse.json({ error: "Request not found" }, { status: 404 });
        }
        if (!(await checkAuthRateLimit(`auto-event:request_submitted:${requestId}`, 1, 86_400))) {
          return NextResponse.json({ fired: 0, skipped: 0, duplicate: true });
        }
        const mrRow = mr as { asset_id: string | null; asset_name: string | null };
        verifiedAssetId = mrRow.asset_id ?? null;
        eventAssetName = mrRow.asset_name ?? null;
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
        assetName: eventAssetName,
        // The caller's own action fired these — never notify them about it.
        actorUserId: callerUserId,
      });

      return NextResponse.json({ fired: fired.length, skipped: skipped.length, details: { fired, skipped } });
    }
  }

  // ── Poll sweep (meter_threshold, part_low_stock, pm_due, wo_overdue) ───────
  // A signed-in member can start this (saving a meter reading does, use-meter-readings),
  // so a user-session run is rate-limited per org and covers the Equipt sweep only — the
  // Landscapt trigger queue and sequence processor below (up to 240s of work) are left
  // to the cron. The cron path is unchanged.
  if (callerOrgId && !(await checkAuthRateLimit(`auto-run:org:${callerOrgId}`, 20, 300))) {
    return NextResponse.json(
      { error: "Automations were just checked for your organization — they'll run again on the next sweep" },
      { status: 429 }
    );
  }

  let autoQuery = (adminClient as AdminClient)
    .from("automations")
    .select("*")
    .in("trigger_type", POLL_TRIGGER_TYPES)
    .in("action_type", SUPPORTED_ACTION_TYPES)
    .eq("enabled", true)
    .is("deleted_at", null);

  if (callerOrgId) {
    autoQuery = autoQuery.eq("org_id", callerOrgId);
    // Saving a meter reading POSTs here for any signed-in member (use-meter-readings), so a
    // caller without automation access may only trigger the meter-threshold sweep.
    if (!(await hasAnySettingsPermission(await createServerClient(), ["automation_view"]))) {
      autoQuery = autoQuery.eq("trigger_type", "meter_threshold");
    }
  }

  const { data: automations, error: autoErr } = await autoQuery;
  if (autoErr) {
    return NextResponse.json({ error: autoErr.message }, { status: 500 });
  }

  const fired: { automationId: string; name: string; result: string }[] = [];
  const skipped: { automationId: string; reason: string }[] = [];
  const now = new Date().toISOString();

  // These poll automations (meter / low stock / PM due / WO overdue) are Equipt's: an org
  // whose plan lacks Equipt (Landscapt-only) has them paused like a canceled org.
  const orgCanceled = createOrgCanceledResolver(adminClient, { requireModule: "equipt" });
  for (const auto of automations ?? []) {
    // One rule's unexpected error (a provider call, a bad row) must not abort the sweep:
    // the queue drain and sequence processor below run after it. executeAction already
    // turns action errors into a retryable skip (so claims are given back); this catches
    // anything else, logs it and moves on.
    try {
      const tc = (auto.trigger_config ?? {}) as Record<string, unknown>;
      const orgId = auto.org_id as string;

      // A canceled org is read-only: its poll automations pause (and resume on
      // resubscribe, with no backfill) — same rule the sequence sweep applies.
      if (await orgCanceled(orgId)) {
        skipped.push({ automationId: auto.id, reason: "org subscription is canceled (or its plan has no Equipt)" });
        continue;
      }

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
          .select("id, current_value, asset_id, asset_name, org_id, kind")
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

        // Rising-meter semantics (>= / <=) only make sense on a cumulative meter,
        // and a level meter (fuel / tank) only supports "drops below" (<). A
        // mismatched rule must never generate preventive-maintenance work.
        const isLevelMeter = meter.kind === "level";
        if (isLevelMeter !== (operator === "<")) {
          skipped.push({
            automationId: auto.id,
            reason: isLevelMeter
              ? `operator ${operator} is not supported on a level meter (use "drops below")`
              : `"drops below" is only supported on a level meter`,
          });
          continue;
        }

        // "<" fires on the value being below the threshold. It goes through the
        // generic fire-once gating below: the firing sets pending_reset, and the
        // `!triggered` branch clears it once the level is back at/above the
        // threshold -- so it fires once per dip, not once per cron run.
        const triggered =
          operator === ">=" ? currentValue >= threshold
          : operator === "<" ? currentValue < threshold
          : currentValue <= threshold;

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
            orgId, assetId: meter.asset_id ?? null, assetName: meter.asset_name || null,
          });
          if ("skipReason" in advOutcome && advOutcome.permanent) {
            // Can never succeed as configured (logged by executeAction): keep the advanced
            // threshold so it isn't retried every run.
            skipped.push({ automationId: auto.id, reason: advOutcome.skipReason });
            continue;
          }
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
          orgId, assetId: meter.asset_id ?? null, assetName: meter.asset_name || null,
        });
        if ("skipReason" in outcome && outcome.permanent) {
          // Can never succeed as configured (logged once by executeAction): keep the claim —
          // it clears when the meter does — instead of retrying every run.
          skipped.push({ automationId: auto.id, reason: outcome.skipReason });
          continue;
        }
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

      // pm_due / wo_overdue fire per record (each due PM schedule / overdue WO, tracked in
      // automation_record_firings) — pending_reset isn't used for them.
      // use-automations.ts saves these keys snake_case (days_ahead, days_overdue); the
      // camelCase reads are kept for old rows.
      if (auto.trigger_type === "pm_due" || auto.trigger_type === "wo_overdue") {
        const candidates = auto.trigger_type === "pm_due"
          ? await duePmScheduleRecords(adminClient as AdminClient, orgId, Number(tc.days_ahead ?? tc.daysAhead ?? 7))
          : await overdueWorkOrderRecords(adminClient as AdminClient, orgId, Number(tc.days_overdue ?? tc.daysOverdue ?? 1));
        const outcome = await firePerRecord(adminClient as AdminClient, auto, orgId, candidates);
        fired.push(...outcome.fired);
        skipped.push(...outcome.skipped);
        continue;
      }

      // part_low_stock uses the same fire-once / clear-on-resolve gating as
      // meter_threshold above, with a different condition check and no asset context.
      let triggered: boolean;
      let notMetReason: string;
      if (auto.trigger_type === "part_low_stock") {
        triggered = await evaluatePartLowStock(adminClient as AdminClient, orgId, ((tc.part_name ?? tc.partName) as string | undefined) ?? "any");
        notMetReason = "no matching part is at or below its minimum stock";
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
      if ("skipReason" in outcome && outcome.permanent) {
        // Can never succeed as configured (logged once): keep the claim until the condition clears.
        skipped.push({ automationId: auto.id, reason: outcome.skipReason });
        continue;
      }
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("equipt poll automation failed", { automationId: auto.id, orgId: auto.org_id, error: message });
      skipped.push({ automationId: auto.id, reason: `error: ${message}` });
    }
  }

  // ── Queued bulk-action triggers ──────────────────────────────────────────
  // Large Clients/Leads bulk actions queue their automation events instead of
  // firing them in the request. Drained before the processor below so the
  // enrollments they create send their due steps in this same run.
  let queuedTriggers = { processed: 0, failed: 0 };
  // User-session runs stop after the Equipt sweep (see the rate limit above).
  if (isCron) try {
    // Both budgets come out of the request's own clock: the poll sweep above isn't
    // bounded, so a long sweep used to leave the processor below a fresh 60s+ that ran
    // past maxDuration and could be killed between a send and its sent marker.
    const queueBudgetMs = Math.min(60_000, remainingMs());
    if (queueBudgetMs > 0) {
      queuedTriggers = await drainTriggerQueue(adminClient, { budgetMs: queueBudgetMs, orgId: callerOrgId });
    }
  } catch (queueErr) {
    log.error("trigger queue drain failed", { error: queueErr instanceof Error ? queueErr.message : String(queueErr) });
  }

  // ── CRM sequence enrollment processor ────────────────────────────────────
  const crmFired: { enrollmentId: string; action: string }[] = [];
  const crmSkipped: { enrollmentId: string; reason: string }[] = [];

  if (isCron) try {
    // Drain the due backlog in claim-sized batches until a time budget is
    // spent, instead of one 50-row batch per 15-minute run (which capped
    // throughput at ~200 steps/hour no matter how many were due). Each row is
    // still claimed atomically in processDueEnrollment, so claim/lease
    // semantics are unchanged. Rows already seen this run (e.g. skipped but
    // still due) are not re-processed; the loop ends when a batch brings
    // nothing new.
    // Whatever is left of the request's budget after the sweep and the queue drain.
    const POLL_BUDGET_MS = Math.max(0, remainingMs());
    const BATCH_SIZE = 50;
    const startedAt = Date.now();
    const seenEnrollmentIds = new Set<string>();

    while (Date.now() - startedAt < POLL_BUDGET_MS) {
      const nowIso = new Date().toISOString();

      let enrollQuery = (adminClient as AdminClient)
        .from("crm_sequence_enrollments")
        .select("id, org_id, sequence_id, client_id, estimate_id, ticket_id, invoice_id, meeting_id, visit_id, visit_date, trigger_type, next_event_position, organizations!inner(plan)")
        // A canceled org is read-only: its automations pause (and resume if it
        // resubscribes). Filtered here so its due rows can't crowd the batch.
        .neq("organizations.plan", "canceled")
        // An expired trial is just as inactive (isOrgInactive). Skipping its rows one at a time
        // left them at the head of the queue forever: past ~1,000 of them, every run saw only
        // already-skipped rows and no other org's sequence step fired again.
        .or(`plan.neq.trial,trial_ends_at.is.null,trial_ends_at.gt.${nowIso},is_platform_staff_org.eq.true`, { referencedTable: "organizations" })
        // An org whose plan lacks Landscapt (Equipt-only) has its sequences paused the same
        // way (resume on upgrade, no catch-up); processDueEnrollment re-checks it too.
        .not("organizations.plan", "in", `(${plansWithoutModule("landscapt").join(",")})`)
        .lte("next_fire_at", nowIso)
        .is("completed_at", null)
        .is("stopped_at", null)
        .is("deleted_at", null)
        .eq("awaiting_approval", false)
        // Oldest-due first so a backlog of rows that kept failing can't
        // starve everything behind them.
        .order("next_fire_at", { ascending: true })
        // Over-fetch by the already-seen count so skipped-but-still-due rows
        // at the head of the queue can't hide fresh ones behind them.
        // PostgREST caps a response at max_rows (1000) anyway.
        .limit(Math.min(1000, BATCH_SIZE + seenEnrollmentIds.size));

      if (callerOrgId) {
        enrollQuery = enrollQuery.eq("org_id", callerOrgId);
      }

      const { data: enrollments, error: enrollErr } = await enrollQuery;
      if (enrollErr) {
        log.error("enrollment query error", { error: enrollErr.message });
        break;
      }

      const fresh = (enrollments ?? []).filter((e: { id: string }) => !seenEnrollmentIds.has(e.id));
      if (fresh.length === 0) break;

      for (const enrollment of fresh.slice(0, BATCH_SIZE)) {
        if (Date.now() - startedAt >= POLL_BUDGET_MS) break;
        seenEnrollmentIds.add(enrollment.id);
        const outcome = await processDueEnrollment(adminClient, enrollment);
        if ("fired" in outcome) {
          crmFired.push(outcome.fired);
        } else {
          crmSkipped.push(outcome.skipped);
        }
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
    queuedTriggers,
  });
}
