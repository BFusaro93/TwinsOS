import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { rescheduleVisitsForSchedule } from "@/lib/visits/schedule-reschedule";

const Body = z.object({
  /** preview — how many upcoming untouched visits would be replaced; apply — replace them. */
  action: z.enum(["preview", "apply"]),
});

/**
 * POST /api/crm/schedules/[scheduleId]/reschedule — after a schedule's day /
 * frequency / excluded dates were edited in Settings, replaces the upcoming
 * untouched visits of every live recurring job on it with ones on the new
 * rules (the same prune + generator the Job Detail reschedule uses).
 *
 * The org comes from the session, and every read/write runs on the caller's
 * RLS client, so a schedule or job outside their org is simply not found.
 */
export async function POST(request: Request, { params }: { params: Promise<{ scheduleId: string }> }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scheduleId } = await params;
  if (!z.string().uuid().safeParse(scheduleId).success) {
    return NextResponse.json({ error: "Invalid schedule id" }, { status: 400 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "action must be preview or apply" }, { status: 400 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  const orgId = profile.org_id as string;

  const today = todayInZone(await getOrgTimeZone(supabase, orgId));
  const result = await rescheduleVisitsForSchedule(supabase, {
    orgId,
    scheduleId,
    today,
    apply: parsed.data.action === "apply",
  });
  if (result.errors.length > 0 && parsed.data.action === "preview") {
    return NextResponse.json({ error: result.errors[0] }, { status: 500 });
  }
  return NextResponse.json({
    jobs: result.jobs,
    count: result.count,
    generated: result.generated,
    ...(result.errors.length > 0 ? { errors: result.errors } : {}),
  });
}
