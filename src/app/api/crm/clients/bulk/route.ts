import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { dispatchClientTriggers, type ClientTriggerEvent } from "@/lib/automations/trigger-queue";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { logger } from "@/lib/logger";
import { chunk } from "@/lib/utils/chunk";
import { firstIssueMessage } from "@/lib/utils/zod-message";

export const maxDuration = 300;

const log = logger.child("clients-bulk");

/** "Select all N matching" can reach every client in a large org. */
const MAX_BULK_CLIENTS = 10_000;

const ids = z.array(z.string().uuid()).min(1).max(MAX_BULK_CLIENTS, `At most ${MAX_BULK_CLIENTS.toLocaleString()} clients at a time`);
const reason = z.string().trim().max(500);

/** The Bulk Edit dialog's fields. Status is "inactive" only: cancel / lost /
 *  activate carry side effects and have their own actions. Do Not Market can
 *  only be turned ON in bulk (see the refine below). */
const Patch = z
  .object({
    status: z.literal("inactive"),
    account_type: z.enum(["residential", "commercial"]),
    source: z.string().trim().max(200).nullable(),
    priority: z.enum(["low", "normal", "high"]),
    ok_to_email: z.boolean(),
    do_not_market: z.boolean(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "Choose a field to update")
  // Do Not Market is how an unsubscribe is recorded. Clearing it for a whole
  // selection would re-subscribe people who opted out; only a single client's
  // edit (with its own confirmation) may turn it off.
  .refine(
    (p) => p.do_not_market !== false,
    "Do Not Market can't be turned off in bulk — clients who unsubscribed must not be re-subscribed. Edit the client individually if they asked to hear from you again."
  );

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_tag"), clientIds: ids, tag: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal("remove_tag"), clientIds: ids, tag: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal("update"), clientIds: ids, patch: Patch }),
  z.object({ action: z.literal("cancel"), clientIds: ids, reason }),
  z.object({ action: z.literal("activate"), clientIds: ids }),
  z.object({ action: z.literal("close_lost"), clientIds: ids, reason }),
]);
type BulkBody = z.infer<typeof Body>;

/** The UI gate for each action, re-checked here (admins pass inside has_settings_permission).
 *  Tags have no key of their own, same as the single-client tag editor. The clients status
 *  trigger (enforce_client_status_transition) checks the same keys per row. */
const ACTION_KEYS: Record<BulkBody["action"], string[] | null> = {
  add_tag: null,
  remove_tag: null,
  update: ["client_bulk_edit"],
  cancel: ["client_activate_deactivate", "client_allow_delete"],
  activate: ["client_activate_deactivate", "client_allow_delete"],
  close_lost: ["lead_allow_delete", "lead_convert_close"],
};

/** A status change in Bulk Edit (to Inactive) also needs the activate/deactivate keys. */
const STATUS_KEYS = ["client_activate_deactivate", "client_allow_delete"];
/** Closing a lead (as Lost) — what Cancel does to the leads in a selection. */
const LEAD_CLOSE_KEYS = ["lead_allow_delete", "lead_convert_close"];
/** Converting a lead / lost lead to an active client. */
const LEAD_CONVERT_KEYS = ["lead_convert_close"];

type OwnedClient = { id: string; status: string | null; source: string | null; ok_to_email: boolean | null };
const isLeadStatus = (st: string | null) => st === "lead" || st === "lost";

/**
 * POST /api/crm/clients/bulk — the Clients / Leads list bulk actions (tags,
 * Bulk Edit, Cancel, Activate, Close as Lost). They ran in the browser, chunk
 * by chunk, so closing the tab mid-way left part of a "select all 4,000"
 * selection done and its automations unfired. Now one request does the whole
 * selection.
 *
 * The org comes from the session, ids from another org or soft-deleted are
 * dropped, and every write goes through the caller's RLS client so the DB
 * guards still apply. Automation events go through dispatchClientTriggers:
 * inline for a small selection, queued for /api/automations/run otherwise.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role === "crew") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Staff impersonating an org act in that org.
  const orgId: string = (await getEffectiveOrgId(supabase)) ?? profile.org_id;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error, "Invalid request") }, { status: 400 });
  }
  const body = parsed.data;

  const keys = ACTION_KEYS[body.action];
  if (keys && !(await hasAnySettingsPermission(supabase, keys))) {
    return NextResponse.json({ error: "You do not have permission to do this" }, { status: 403 });
  }
  if (body.action === "update" && body.patch.status && !(await hasAnySettingsPermission(supabase, STATUS_KEYS))) {
    return NextResponse.json({ error: "You do not have permission to change client status" }, { status: 403 });
  }
  // Leads in a Cancel / Activate selection need the lead keys; without them they are skipped
  // (and counted) rather than failing the whole selection on the status trigger.
  const leadKeys = {
    close: body.action === "cancel" ? await hasAnySettingsPermission(supabase, LEAD_CLOSE_KEYS) : false,
    convert: body.action === "activate" ? await hasAnySettingsPermission(supabase, LEAD_CONVERT_KEYS) : false,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // The selection, re-read under the session org: foreign and deleted ids drop out.
  const owned: OwnedClient[] = [];
  for (const batch of chunk([...new Set(body.clientIds)])) {
    const { data, error } = await db
      .from("clients")
      .select("id, status, source, ok_to_email")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .in("id", batch);
    if (error) return serverError("client lookup failed", error);
    owned.push(...(data ?? []));
  }

  try {
    const result = await runAction(db, orgId, body, owned, leadKeys);
    const triggers = await dispatchClientTriggers(supabase, createServiceClient(), {
      orgId,
      userId: user.id,
      events: result.events,
    });
    await logActivities(db, user.id, result.activity);
    return NextResponse.json({ ok: true, affected: result.affected, skipped: result.skipped ?? 0, ...triggers });
  } catch (err) {
    return serverError(`${body.action} failed`, err);
  }
}

interface ActionResult {
  affected: number;
  /** Selected rows left alone because the caller lacks the lead keys for them. */
  skipped?: number;
  events: ClientTriggerEvent[];
  /** Timeline rows: one subject for a list of clients. */
  activity: { subject: string; clientIds: string[] }[];
}

async function runAction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  body: BulkBody,
  owned: OwnedClient[],
  leadKeys: { close: boolean; convert: boolean }
): Promise<ActionResult> {
  const ownedIds = owned.map((c) => c.id);

  switch (body.action) {
    case "add_tag": {
      const added: string[] = [];
      for (const batch of chunk(ownedIds, 500)) {
        // ignoreDuplicates returns only the rows actually inserted, so clients that
        // already had the tag aren't reported (or re-triggered) as newly tagged.
        const { data, error } = await db
          .from("client_tags")
          .upsert(batch.map((client_id) => ({ client_id, tag: body.tag })), { onConflict: "org_id,client_id,tag", ignoreDuplicates: true })
          .select("client_id");
        if (error) throw error;
        added.push(...(data ?? []).map((r: { client_id: string }) => r.client_id));
      }
      return {
        affected: added.length,
        events: [{ triggerType: "tag_added", clientIds: added, matchValues: [body.tag] }],
        activity: [{ subject: `Tag added: ${body.tag}`, clientIds: added }],
      };
    }

    case "remove_tag": {
      const removed: string[] = [];
      for (const batch of chunk(ownedIds)) {
        const { data, error } = await db
          .from("client_tags")
          .delete()
          .eq("org_id", orgId)
          .in("client_id", batch)
          .eq("tag", body.tag)
          .select("client_id");
        if (error) throw error;
        removed.push(...(data ?? []).map((r: { client_id: string }) => r.client_id));
      }
      const unique = [...new Set(removed)];
      return {
        affected: unique.length,
        events: [{ triggerType: "tag_removed", clientIds: unique, matchValues: [body.tag] }],
        activity: [{ subject: `Tag removed: ${body.tag}`, clientIds: unique }],
      };
    }

    case "update": {
      const updated = new Set<string>();
      // "Inactive" means a former client: a lead or lost lead never was one, so
      // the status part skips them (they keep any other field in the patch).
      const { status: newStatus, ...otherFields } = body.patch;
      const writes: { patch: Record<string, unknown>; skipLeads: boolean }[] = [];
      if (newStatus) writes.push({ patch: { status: newStatus }, skipLeads: true });
      if (Object.keys(otherFields).length > 0) writes.push({ patch: otherFields, skipLeads: false });
      for (const write of writes) {
        for (const batch of chunk(ownedIds)) {
          let q = db
            .from("clients")
            .update(write.patch)
            .eq("org_id", orgId)
            .is("deleted_at", null)
            .in("id", batch);
          if (write.skipLeads) q = q.not("status", "in", "(lead,lost)");
          const { data, error } = await q.select("id");
          if (error) throw error;
          for (const r of data ?? []) updated.add(r.id);
        }
      }
      // The single-client edit fires client_source_updated / has_opted_in_emails
      // when those values actually change, so compare against the prior values.
      const changed = owned.filter((c) => updated.has(c.id));
      const events: ClientTriggerEvent[] = [];
      if ("source" in body.patch) {
        const newSource = body.patch.source ?? null;
        events.push({
          triggerType: "client_source_updated",
          clientIds: changed.filter((c) => c.source !== newSource).map((c) => c.id),
          matchValues: newSource ? [newSource] : undefined,
        });
      }
      if (body.patch.ok_to_email === true) {
        events.push({ triggerType: "has_opted_in_emails", clientIds: changed.filter((c) => c.ok_to_email !== true).map((c) => c.id) });
      }
      return { affected: updated.size, events, activity: [] };
    }

    case "cancel": {
      // Records already cancelled/lost are left alone so their original reason isn't overwritten.
      // A lead never became a client, so "cancelling" it closes it as Lost — a cancelled
      // lead used to count as a churned client (and a later Activate skipped conversion).
      const closedAt = new Date().toISOString();
      const leadTargets = owned.filter((c) => c.status === "lead");
      const leadsAllowed = leadKeys.close ? leadTargets : [];
      const clientTargets = owned.filter((c) => c.status !== "cancelled" && !isLeadStatus(c.status));
      const lost: string[] = [];
      for (const batch of chunk(leadsAllowed.map((t) => t.id))) {
        const { data, error } = await db
          .from("clients")
          .update({ status: "lost", cancellation_reason: body.reason, closed_at: closedAt })
          .eq("org_id", orgId)
          .in("id", batch)
          .eq("status", "lead")
          .select("id");
        if (error) throw error;
        lost.push(...(data ?? []).map((r: { id: string }) => r.id));
      }
      const cancelled: string[] = [];
      for (const batch of chunk(clientTargets.map((t) => t.id))) {
        const { data, error } = await db
          .from("clients")
          .update({ status: "cancelled", cancellation_reason: body.reason, closed_at: closedAt })
          .eq("org_id", orgId)
          .in("id", batch)
          .not("status", "in", "(cancelled,lost,lead)")
          .select("id");
        if (error) throw error;
        cancelled.push(...(data ?? []).map((r: { id: string }) => r.id));
      }
      return {
        affected: lost.length + cancelled.length,
        skipped: leadTargets.length - leadsAllowed.length,
        events: [
          { triggerType: "lead_cancelled", clientIds: lost },
          { triggerType: "client_cancelled", clientIds: cancelled },
        ],
        // The reason is cleared from the row on reactivation, so the timeline is its record.
        activity: [
          { subject: `Lead closed as lost${body.reason ? `: ${body.reason}` : ""}`, clientIds: lost },
          { subject: `Client cancelled${body.reason ? `: ${body.reason}` : ""}`, clientIds: cancelled },
        ],
      };
    }

    case "activate": {
      // An account that was never a client (no client_since, job or invoice — a lead, a lost
      // lead, or a lead once set Inactive) converts: client_since is stamped and
      // lead_converted_to_client fires. Anything else is a reactivation.
      const today = todayInZone(await getOrgTimeZone(db, orgId));
      const leadIds: string[] = [];
      const otherIds: string[] = [];
      const notActive = owned.filter((c) => c.status !== "active");
      // Converting a lead / lost lead needs lead_convert_close; without it those rows are skipped.
      const allowed = notActive.filter((c) => !isLeadStatus(c.status) || leadKeys.convert);
      for (const batch of chunk(allowed)) {
        const { data: neverData, error: neverErr } = await db.rpc("crm_clients_never_converted", { p_client_ids: batch.map((c) => c.id) });
        if (neverErr) throw neverErr;
        const never = new Set<string>((neverData ?? []) as string[]);
        const converting = batch.filter((c) => never.has(c.id)).map((c) => c.id);
        const others = batch.filter((c) => !never.has(c.id)).map((c) => c.id);
        if (converting.length > 0) {
          const { data, error } = await db
            .from("clients")
            .update({ status: "active", cancellation_reason: null, closed_at: null, client_since: today })
            .eq("org_id", orgId)
            .in("id", converting)
            .neq("status", "active")
            .is("client_since", null)
            .select("id");
          if (error) throw error;
          leadIds.push(...(data ?? []).map((r: { id: string }) => r.id));
        }
        if (others.length > 0) {
          const { data, error } = await db
            .from("clients")
            .update({ status: "active", cancellation_reason: null, closed_at: null })
            .eq("org_id", orgId)
            .in("id", others)
            .neq("status", "active")
            .select("id");
          if (error) throw error;
          otherIds.push(...(data ?? []).map((r: { id: string }) => r.id));
        }
      }
      return {
        affected: leadIds.length + otherIds.length,
        skipped: notActive.length - allowed.length,
        events: [
          { triggerType: "lead_converted_to_client", clientIds: leadIds },
          { triggerType: "client_reactivated", clientIds: otherIds },
        ],
        activity: [
          { subject: "Converted from lead to client", clientIds: leadIds },
          { subject: "Client reactivated", clientIds: otherIds },
        ],
      };
    }

    case "close_lost": {
      // Selected rows that are no longer leads (converted meanwhile) are left alone.
      const closedAt = new Date().toISOString();
      const closed: string[] = [];
      for (const batch of chunk(owned.filter((c) => c.status === "lead").map((c) => c.id))) {
        const { data, error } = await db
          .from("clients")
          .update({ status: "lost", cancellation_reason: body.reason, closed_at: closedAt })
          .eq("org_id", orgId)
          .in("id", batch)
          .eq("status", "lead")
          .select("id");
        if (error) throw error;
        closed.push(...(data ?? []).map((r: { id: string }) => r.id));
      }
      return {
        affected: closed.length,
        // Closing as lost is how a lead is cancelled from the Leads page — same trigger
        // as cancelling a lead from the Clients list (see the cancel case above).
        events: [{ triggerType: "lead_cancelled", clientIds: closed }],
        activity: [{ subject: `Lead closed as lost${body.reason ? `: ${body.reason}` : ""}`, clientIds: closed }],
      };
    }
  }
}

/** Timeline rows, one insert per 500. Never throws: the action already happened. */
async function logActivities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  entries: { subject: string; clientIds: string[] }[]
) {
  for (const { subject, clientIds } of entries) {
    for (const batch of chunk(clientIds, 500)) {
      const { error } = await db.from("client_activity").insert(
        batch.map((client_id) => ({ client_id, activity_type: "note", subject, body: null, created_by: userId }))
      );
      if (error) {
        log.warn("client_activity bulk log failed", { count: clientIds.length, subject, error: error.message });
        break;
      }
    }
  }
}

function serverError(what: string, err: unknown) {
  log.error(what, { error: err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err) });
  return NextResponse.json({ error: "The bulk action stopped partway. Refresh to see which clients changed, then try again." }, { status: 500 });
}
