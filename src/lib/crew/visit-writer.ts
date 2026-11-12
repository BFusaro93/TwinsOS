import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * The client crew routes use to WRITE a visit's time and billing columns
 * (clocked_in_at / clocked_out_at, break_minutes, paused_at, start/end time,
 * actual_hours, men_count, snow depth, push / storm).
 *
 * A crew login can't write those columns directly any more
 * (a_crm_job_visits_crew_price_guard): snow bills from depth and clock
 * stamps, so a crew editing its own visit through PostgREST could raise its
 * own invoice. The crew routes write them with the service role instead,
 * ONLY after their own checks (assertCallerOwnsVisit, stop-key derivation,
 * read-only org) — the same pattern the punch writes use.
 *
 * `actingUserId` is sent as `x-acting-user-id`; fn_audit_log reads it for
 * service-role writes, so the visit's history still names the crew login (or
 * office user) that tapped the button rather than "system". It is only
 * trusted on a service-role request, which only this server can make.
 */
export function createVisitWriter(actingUserId: string) {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-acting-user-id": actingUserId } },
    }
  );
}
