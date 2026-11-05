import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { isEligibleForEnrollment, enrollClientInSequence, triggerConditionsMet } from "@/lib/automations/sequence-enrollment";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone, shiftYmd } from "@/lib/time/zone";
import { createOrgOutboundMutedResolver } from "@/lib/orgs/org-canceled";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
// Loops every org; give it room before the default function limit.
export const maxDuration = 300;

/**
 * GET  /api/crm/estimates/automation-date-triggers — called by Vercel Cron
 * POST /api/crm/estimates/automation-date-triggers — manual trigger for testing
 *
 * Evaluates the two date-gap automation trigger types (estimate_expiring,
 * estimate_no_response) and enrolls matching estimates into their sequences.
 * This does NOT send anything itself — it only creates rows in
 * crm_sequence_enrollments, which /api/automations/run then processes exactly
 * like any event-based enrollment (e.g. estimate_sent).
 */

/** How far past the no-response point an estimate is still picked up (covers missed runs). */
const NO_RESPONSE_LOOKBACK_DAYS = 30;
/** Stop before maxDuration; the remaining triggers run first next time. */
const RUN_BUDGET_MS = 270_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>;

export async function GET(request: Request) {
  return handleRun(request);
}

export async function POST(request: Request) {
  return handleRun(request);
}

async function handleRun(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase: AdminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: triggers } = await supabase
    .from("crm_sequence_triggers")
    .select("id, sequence_id, trigger_type, config, crm_automation_sequences(is_active, allow_reentry, reentry_after_minutes, crm_automations(is_active, org_id))")
    .in("trigger_type", ["estimate_expiring", "estimate_no_response"]);

  let enrolled = 0;
  let stoppedEarly = false;
  const orgCanceled = createOrgOutboundMutedResolver(supabase);
  // Each matching estimate costs several sequential queries. Start at a different trigger each
  // day and stop before maxDuration, so a large org can't use up every run and leave the
  // triggers (and estimates) after it never checked.
  const startedAt = Date.now();
  const list = [...(triggers ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const offset = list.length ? Math.floor(startedAt / 86_400_000) % list.length : 0;

  outer: for (const trigger of [...list.slice(offset), ...list.slice(0, offset)]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seq = trigger.crm_automation_sequences as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auto = seq?.crm_automations as any;
    if (!seq?.is_active || !auto?.is_active) continue;

    const orgId = auto.org_id as string;
    if (await orgCanceled(orgId)) continue; // canceled orgs get no automated enrollments
    const days = (trigger.config as { days?: number } | null)?.days;
    if (!days || days <= 0) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let matches: any[] = [];

    if (trigger.trigger_type === "estimate_expiring") {
      // valid_until_date is a calendar date, so the window has to be measured
      // on the org's calendar. A UTC "today" is a LOWER bound here, and UTC is
      // at or ahead of every US zone — so it silently drops the estimates
      // expiring on the org's own today and shifts the whole window a day late
      // for any org whose date hasn't rolled over yet (Hawaii at this cron's
      // hour). The query is already per-org, so resolve the day directly
      // rather than over-fetching and re-filtering.
      const orgToday = todayInZone(await getOrgTimeZone(supabase, orgId));
      // Paged: a single select stops at 1,000 rows in arbitrary order.
      matches = await fetchAllRows<{ id: string; client_id: string }>(() =>
        supabase
          .from("estimates")
          .select("id, client_id")
          .eq("org_id", orgId)
          .in("stage", ["sent", "quote"])
          .is("deleted_at", null)
          .not("valid_until_date", "is", null)
          .gte("valid_until_date", orgToday)
          .lte("valid_until_date", shiftYmd(orgToday, days))
          .order("id"));
    } else {
      // estimate_no_response
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      // An estimate becomes due once, `days` after it was sent. Looking back only
      // NO_RESPONSE_LOOKBACK_DAYS past that (room for missed runs) instead of over every
      // open estimate ever sent: that grew without bound and, with re-entry on, re-enrolled
      // years-old estimates every day.
      const floor = new Date(cutoff);
      floor.setDate(floor.getDate() - NO_RESPONSE_LOOKBACK_DAYS);
      matches = await fetchAllRows<{ id: string; client_id: string }>(() =>
        supabase
          .from("estimates")
          .select("id, client_id")
          .eq("org_id", orgId)
          .in("stage", ["sent", "quote"])
          .is("deleted_at", null)
          .not("sent_at", "is", null)
          .lte("sent_at", cutoff.toISOString())
          .gte("sent_at", floor.toISOString())
          .order("id"));
    }

    for (const est of matches) {
      if (Date.now() - startedAt > RUN_BUDGET_MS) { stoppedEarly = true; break outer; }
      if (!(await triggerConditionsMet(supabase, trigger.id, est.client_id, est.id))) continue;

      // A date-gap trigger fires off a fixed anchor (valid_until_date / sent_at)
      // that never changes, so without allow_reentry a prior enrollment row —
      // regardless of its status — permanently blocks re-enrollment for this
      // estimate+sequence.
      const eligible = await isEligibleForEnrollment(supabase, {
        sequenceId: trigger.sequence_id,
        clientId: est.client_id,
        estimateId: est.id,
        allowReentry: seq.allow_reentry ?? false,
        reentryAfterMinutes: seq.reentry_after_minutes ?? 1440,
      });
      if (!eligible) continue;

      const ok = await enrollClientInSequence(supabase, {
        sequenceId: trigger.sequence_id,
        orgId,
        clientId: est.client_id,
        estimateId: est.id,
      });
      if (ok) enrolled++;
    }
  }

  return NextResponse.json({ enrolled, stoppedEarly });
}
