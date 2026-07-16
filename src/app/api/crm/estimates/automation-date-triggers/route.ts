import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

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

  const todayStr = new Date().toISOString().split("T")[0];

  const { data: triggers } = await supabase
    .from("crm_sequence_triggers")
    .select("sequence_id, trigger_type, config, crm_automation_sequences(is_active, crm_automations(is_active, org_id))")
    .in("trigger_type", ["estimate_expiring", "estimate_no_response"]);

  let enrolled = 0;

  for (const trigger of triggers ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seq = trigger.crm_automation_sequences as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auto = seq?.crm_automations as any;
    if (!seq?.is_active || !auto?.is_active) continue;

    const orgId = auto.org_id as string;
    const days = (trigger.config as { days?: number } | null)?.days;
    if (!days || days <= 0) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let matches: any[] = [];

    if (trigger.trigger_type === "estimate_expiring") {
      const windowEnd = new Date();
      windowEnd.setDate(windowEnd.getDate() + days);
      const { data } = await supabase
        .from("estimates")
        .select("id, client_id")
        .eq("org_id", orgId)
        .in("stage", ["sent", "quote"])
        .is("deleted_at", null)
        .not("valid_until_date", "is", null)
        .gte("valid_until_date", todayStr)
        .lte("valid_until_date", windowEnd.toISOString().split("T")[0]);
      matches = data ?? [];
    } else {
      // estimate_no_response
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const { data } = await supabase
        .from("estimates")
        .select("id, client_id")
        .eq("org_id", orgId)
        .in("stage", ["sent", "quote"])
        .is("deleted_at", null)
        .not("sent_at", "is", null)
        .lte("sent_at", cutoff.toISOString());
      matches = data ?? [];
    }

    for (const est of matches) {
      // A date-gap trigger fires off a fixed anchor (valid_until_date / sent_at)
      // that never changes, so a single enrollment row — regardless of its
      // status — permanently blocks re-enrollment for this estimate+sequence.
      const { data: existing } = await supabase
        .from("crm_sequence_enrollments")
        .select("id")
        .eq("sequence_id", trigger.sequence_id)
        .eq("estimate_id", est.id)
        .maybeSingle();
      if (existing) continue;

      const { data: firstEvent } = await supabase
        .from("crm_sequence_events")
        .select("event_type, config")
        .eq("sequence_id", trigger.sequence_id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();

      let nextFireAt = new Date().toISOString();
      if (firstEvent?.event_type === "wait") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const waitDays = (firstEvent.config as any)?.days ?? 0;
        const d = new Date();
        d.setDate(d.getDate() + waitDays);
        nextFireAt = d.toISOString();
      }

      const { error: insertErr } = await supabase.from("crm_sequence_enrollments").insert({
        org_id: orgId,
        sequence_id: trigger.sequence_id,
        client_id: est.client_id,
        estimate_id: est.id,
        enrolled_at: new Date().toISOString(),
        next_event_position: firstEvent?.event_type === "wait" ? 1 : 0,
        next_fire_at: nextFireAt,
      });
      if (!insertErr) enrolled++;
    }
  }

  return NextResponse.json({ enrolled });
}
