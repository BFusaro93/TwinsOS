import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";

const Body = z.object({
  // HH:mm in the crew member's local time — the server (Vercel) runs in UTC,
  // so the actual local time-of-day must come from the client's browser clock.
  localTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  // Accepts either the web app's cookie session or crew-app's bearer token —
  // see getRouteAuth().
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const now = new Date().toISOString();

  // Idempotent/double-tap safe, matching the stops batch clock-in — a
  // second tap must not reset an already-recorded start time and silently
  // shorten the visit's duration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("crm_job_visits")
    .select("clocked_in_at, org_id, crew_id")
    .eq("id", visitId)
    .is("deleted_at", null)
    .single();
  if (!existing) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, existing.org_id, existing.crew_id))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }
  if (existing?.clocked_in_at) {
    return NextResponse.json({ error: "Already clocked in" }, { status: 409 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_visits")
    .update({
      clocked_in_at: now,
      start_time: parsed.data.localTime ? `${parsed.data.localTime}:00` : undefined,
      status: "in_progress",
      updated_at: now,
    })
    .eq("id", visitId)
    .is("clocked_in_at", null)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
