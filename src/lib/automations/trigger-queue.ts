import { fetchOrgTriggers, fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { processEnrollmentImmediately } from "@/lib/automations/sequence-processor";
import { logger } from "@/lib/logger";
import { isZapierTriggerType } from "@/lib/integrations/zapier";
import { chunk } from "@/lib/utils/chunk";
import type { TriggerType } from "@/types/crm-automations";

const log = logger.child("trigger-queue");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** One automation event for a set of clients, all with the same match value. */
export interface ClientTriggerEvent {
  triggerType: TriggerType;
  clientIds: string[];
  matchValues?: string[];
}

/**
 * Bulk actions at or below this many client events fire inside the request,
 * the same way a single-client action does (first step sent at once). Larger
 * selections are queued for /api/automations/run: each event can enroll the
 * client in sequences that send immediately, and thousands of them would
 * outrun the request.
 */
export const INLINE_TRIGGER_LIMIT = 50;

/** Gives up on a queued event after this many failed attempts. */
const MAX_ATTEMPTS = 5;
/** How long a claimed row is reserved for the run that claimed it. A run that dies
 *  mid-row frees it for the next run once this passes. */
const CLAIM_LEASE_MS = 5 * 60 * 1000;

/**
 * Fires (or queues) the automation events a bulk client action produced. The
 * events are verified by the write itself — only clients whose state actually
 * changed are passed — so there is no per-call replay limit here, unlike the
 * browser-callable /api/automations/fire-trigger. Never throws: a trigger
 * failure must not fail the action it describes.
 */
export async function dispatchClientTriggers(
  sessionDb: AnyClient,
  admin: AnyClient,
  args: { orgId: string; userId: string; events: ClientTriggerEvent[] }
): Promise<{ fired: number; queued: number }> {
  const events = args.events.filter((e) => e.clientIds.length > 0);
  const total = events.reduce((n, e) => n + e.clientIds.length, 0);
  if (total === 0) return { fired: 0, queued: 0 };

  try {
    if (total <= INLINE_TRIGGER_LIMIT) {
      const enrollmentIds: string[] = [];
      for (const e of events) {
        const triggers = await fetchOrgTriggers(sessionDb, args.orgId, e.triggerType);
        for (const clientId of e.clientIds) {
          enrollmentIds.push(
            ...(await fireSimpleTrigger(
              sessionDb,
              { orgId: args.orgId, clientId, triggerType: e.triggerType, matchValues: e.matchValues },
              triggers
            ))
          );
        }
      }
      for (const enrollmentId of enrollmentIds) {
        try {
          await processEnrollmentImmediately(admin, enrollmentId);
        } catch (err) {
          log.error("immediate processing failed", { enrollmentId, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return { fired: total, queued: 0 };
    }

    const rows = events.flatMap((e) =>
      e.clientIds.map((client_id) => ({
        org_id: args.orgId,
        client_id,
        trigger_type: e.triggerType,
        match_values: e.matchValues ?? null,
        created_by: args.userId,
      }))
    );
    for (const batch of chunk(rows, 500)) {
      const { error } = await admin.from("crm_automation_trigger_queue").insert(batch);
      if (error) throw error;
    }
    return { fired: 0, queued: total };
  } catch (err) {
    log.error("dispatch failed", { orgId: args.orgId, total, error: err instanceof Error ? err.message : String(err) });
    return { fired: 0, queued: 0 };
  }
}

/** True when at least one of these trigger rows belongs to a live (active, not deleted) sequence and automation. */
function hasLiveTrigger(triggers: unknown[]): boolean {
  return triggers.some((t) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seq = (t as { crm_automation_sequences?: any }).crm_automation_sequences;
    const auto = seq?.crm_automations;
    return !!seq?.is_active && !!auto?.is_active && !seq.deleted_at && !auto.deleted_at;
  });
}

/** Whether a Zapier REST hook would receive this event (same checks as notifyZapierSubscribers). */
async function hasZapierSubscribers(admin: AnyClient, orgId: string, triggerType: string): Promise<boolean> {
  if (!isZapierTriggerType(triggerType)) return false;
  const { data: integration } = await admin
    .from("integrations")
    .select("enabled")
    .eq("org_id", orgId)
    .eq("provider", "zapier")
    .maybeSingle();
  if (!integration?.enabled) return false;
  const { count } = await admin
    .from("zapier_webhook_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("trigger_type", triggerType)
    .is("deleted_at", null);
  return (count ?? 0) > 0;
}

interface QueueRow {
  id: string;
  org_id: string;
  client_id: string;
  trigger_type: TriggerType;
  match_values: string[] | null;
  attempts: number;
}

/**
 * Fires queued bulk-action events, oldest first, until the time budget is
 * spent. Run by /api/automations/run before its enrollment processor, so the
 * enrollments created here send their due steps in the same run. A caller
 * org (a signed-in user running the processor by hand) limits the drain to
 * that org.
 */
export async function drainTriggerQueue(
  admin: AnyClient,
  opts: { budgetMs: number; orgId?: string | null }
): Promise<{ processed: number; failed: number }> {
  const startedAt = Date.now();
  let processed = 0;
  let failed = 0;
  // One trigger lookup per org + type per run, not per queued row.
  const triggerCache = new Map<string, unknown[]>();
  // Whether anything (a live sequence trigger or a Zapier hook) listens for that org + type.
  const listenedCache = new Map<string, boolean>();
  // A row that failed is retried on the next run, not again in this one.
  const seen = new Set<string>();

  while (Date.now() - startedAt < opts.budgetMs) {
    let q = admin
      .from("crm_automation_trigger_queue")
      .select("id, org_id, client_id, trigger_type, match_values, attempts")
      .is("processed_at", null)
      .lt("attempts", MAX_ATTEMPTS)
      // Rows another run holds right now are left to it.
      .or(`claimed_until.is.null,claimed_until.lt.${new Date().toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(Math.min(1000, 200 + seen.size));
    if (opts.orgId) q = q.eq("org_id", opts.orgId);
    const { data, error } = await q;
    if (error) {
      log.error("queue read failed", { error: error.message });
      break;
    }
    const rows = ((data ?? []) as QueueRow[]).filter((r) => !seen.has(r.id));
    if (rows.length === 0) break;
    for (const row of rows) seen.add(row.id);

    // Claim the whole page in one conditional update (it used to be one round
    // trip per row): of two concurrent runs (the cron and a member running the
    // processor by hand) only the rows THIS update matched are fired here.
    const claimNow = new Date();
    const claimedIds = new Set<string>();
    for (const ids of chunk(rows.map((r) => r.id), 100)) {
      const { data: claimed, error: claimErr } = await admin
        .from("crm_automation_trigger_queue")
        .update({ claimed_until: new Date(claimNow.getTime() + CLAIM_LEASE_MS).toISOString() })
        .in("id", ids)
        .is("processed_at", null)
        .or(`claimed_until.is.null,claimed_until.lt.${claimNow.toISOString()}`)
        .select("id");
      if (claimErr) {
        log.error("queue claim failed", { error: claimErr.message });
        continue;
      }
      for (const c of (claimed ?? []) as { id: string }[]) claimedIds.add(c.id);
    }
    const mine = rows.filter((r) => claimedIds.has(r.id));

    // Events nothing listens to — no active sequence for that trigger type and no
    // Zapier subscription — are marked processed in bulk instead of being fired
    // one by one (each fire is a client lookup that then does nothing).
    const idle: string[] = [];
    const work: QueueRow[] = [];
    for (const row of mine) {
      const cacheKey = `${row.org_id}:${row.trigger_type}`;
      let listened = listenedCache.get(cacheKey);
      if (listened === undefined) {
        let triggers = triggerCache.get(cacheKey);
        if (!triggers) {
          triggers = (await fetchOrgTriggers(admin, row.org_id, row.trigger_type)) ?? [];
          triggerCache.set(cacheKey, triggers);
        }
        listened = hasLiveTrigger(triggers) || (await hasZapierSubscribers(admin, row.org_id, row.trigger_type));
        listenedCache.set(cacheKey, listened);
      }
      if (listened) work.push(row);
      else idle.push(row.id);
    }
    for (const ids of chunk(idle, 100)) {
      const doneAt = new Date().toISOString();
      const { error: idleErr } = await admin
        .from("crm_automation_trigger_queue")
        .update({ processed_at: doneAt, updated_at: doneAt })
        .in("id", ids);
      if (idleErr) log.error("queue idle mark failed", { error: idleErr.message });
      else processed += ids.length;
    }

    for (const row of work) {
      // Past the budget: hand the rest of the claimed page back for the next run.
      if (Date.now() - startedAt >= opts.budgetMs) {
        const rest = work.slice(work.indexOf(row)).map((r) => r.id);
        for (const ids of chunk(rest, 100)) {
          await admin.from("crm_automation_trigger_queue").update({ claimed_until: null }).in("id", ids).is("processed_at", null);
        }
        break;
      }
      const cacheKey = `${row.org_id}:${row.trigger_type}`;
      try {
        await fireSimpleTrigger(
          admin,
          { orgId: row.org_id, clientId: row.client_id, triggerType: row.trigger_type, matchValues: row.match_values ?? undefined },
          triggerCache.get(cacheKey) ?? []
        );
        await admin
          .from("crm_automation_trigger_queue")
          .update({ processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", row.id);
        processed++;
      } catch (err) {
        failed++;
        await admin
          .from("crm_automation_trigger_queue")
          .update({
            attempts: row.attempts + 1,
            last_error: err instanceof Error ? err.message : String(err),
            // Released for the next run's retry.
            claimed_until: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
    }
  }
  return { processed, failed };
}
