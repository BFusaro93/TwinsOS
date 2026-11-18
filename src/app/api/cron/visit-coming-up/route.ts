import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fireVisitTriggers, type ChangedVisit } from "@/lib/automations/fire-visit-triggers";
import { resolveDateGapDays } from "@/lib/automations/activation-warnings";
import { createOrgOutboundMutedResolver } from "@/lib/orgs/org-canceled";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { shiftYmd, todayInZone } from "@/lib/time/zone";
import { logger } from "@/lib/logger";

const log = logger.child("cron/visit-coming-up");

/**
 * GET /api/cron/visit-coming-up — called daily by Vercel Cron (14:05 UTC, about 9–10am
 * Eastern, with the other date-based automation crons).
 *
 * Fires the "Visit is coming up" trigger: for each trigger's "N days before the visit"
 * (1 when left blank), every client with a scheduled or dispatched visit N days from
 * the org's today is started on the sequence. Like the other visit triggers, the run is
 * once per client per service day, the trigger's service filter matches any service
 * on that day, and [visitdate] / [visitservices] read that day. A run whose day no
 * longer has a live visit (cancelled, skipped, moved) stops before its next step.
 *
 * Running it again the same day is safe: the run is deduped per client, day and trigger.
 */
export const maxDuration = 300;

const LIVE_STATUSES = ["scheduled", "dispatched"];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Every visit_coming_up trigger, paged (a single select stops at 1000 rows).
  type TriggerRow = { id: string; org_id: string; config: unknown };
  const triggers: TriggerRow[] = [];
  for (let from = 0; ; ) {
    const { data: page, error } = await supabase
      .from("crm_sequence_triggers")
      .select("id, org_id, config")
      .eq("trigger_type", "visit_coming_up")
      .order("id")
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!page || page.length === 0) break;
    triggers.push(...(page as TriggerRow[]));
    if (page.length < 1000) break;
    from += page.length;
  }

  // org → the distinct day counts its triggers use (inactive sequences are filtered
  // out inside fireSimpleTrigger, like every other trigger).
  const daysByOrg = new Map<string, Set<number>>();
  for (const t of triggers) {
    const days = resolveDateGapDays(t.config, "visit_coming_up");
    if (days === null) continue;
    const set = daysByOrg.get(t.org_id) ?? new Set<number>();
    set.add(days);
    daysByOrg.set(t.org_id, set);
  }

  const startedAt = Date.now();
  const orgMuted = createOrgOutboundMutedResolver(supabase, { requireModule: "landscapt" });
  let runs = 0;
  let stoppedEarly = false;

  outer: for (const [orgId, daySet] of daysByOrg) {
    if (await orgMuted(orgId)) continue; // canceled / Equipt-only orgs send nothing
    const orgToday = todayInZone(await getOrgTimeZone(supabase, orgId));

    for (const days of daySet) {
      if (Date.now() - startedAt > 270_000) { stoppedEarly = true; break outer; }
      const target = shiftYmd(orgToday, days);

      const visits: ChangedVisit[] = [];
      for (let from = 0; ; ) {
        const { data: page, error } = await supabase
          .from("crm_job_visits")
          .select("id, client_id, job_id, job_service_id")
          .eq("org_id", orgId)
          .eq("scheduled_date", target)
          .in("status", LIVE_STATUSES)
          .is("deleted_at", null)
          .not("client_id", "is", null)
          .order("start_time", { ascending: true, nullsFirst: false })
          .order("id")
          .range(from, from + 999);
        if (error) {
          log.error("visit lookup failed", { orgId, target, error: error.message });
          break;
        }
        if (!page || page.length === 0) break;
        visits.push(...(page as ChangedVisit[]));
        if (page.length < 1000) break;
        from += page.length;
      }
      if (visits.length === 0) continue;

      runs += await fireVisitTriggers(supabase, {
        orgId,
        triggerTypes: ["visit_coming_up"],
        visits,
        triggerFilter: (t: { config?: unknown }) => resolveDateGapDays(t.config, "visit_coming_up") === days,
        // Leave time for the remaining orgs; unsent steps go out on the automations sweep.
        processBudgetMs: Math.max(0, 240_000 - (Date.now() - startedAt)),
      });
    }
  }

  return NextResponse.json({ orgs: daysByOrg.size, runs, stoppedEarly });
}
