import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { notifyVisitAssigned } from "@/lib/notifications/visit-notify";

/**
 * Multi-crew stops — see supabase/migrations/20261029000000_multi_crew_visits.sql.
 *
 *   POST   { crewId }   adds a crew to the visit's stop (creates that crew's own
 *                       sibling visit) and returns { visitId } for it
 *   DELETE              takes THIS visit's crew back off the stop (soft-deletes
 *                       the visit; only before that crew has started)
 *
 * Both go through RPCs that run as the caller (RLS), so crew logins — which
 * can't insert visits — are refused, and every org/crew/status rule is
 * enforced in the database. The RPC's own message is returned on a refusal.
 */

const AddBody = z.object({ crewId: z.string().uuid() });

async function authedClient() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await authedClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;
  if (!z.string().uuid().safeParse(visitId).success) {
    return NextResponse.json({ error: "Invalid visit id" }, { status: 400 });
  }
  const parsed = AddBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newVisitId, error } = await (supabase as any).rpc("crm_add_visit_crew", {
    p_visit_id: visitId,
    p_crew_id: parsed.data.crewId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  // Best-effort "you've been assigned" push to the added crew — same trigger a
  // normal reassignment fires.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created } = await (supabase as any)
    .from("crm_job_visits")
    .select("client_id, scheduled_date, start_time")
    .eq("id", newVisitId)
    .maybeSingle();
  void notifyVisitAssigned({
    visitId: newVisitId as string,
    crewId: parsed.data.crewId,
    clientId: (created?.client_id as string | undefined) ?? undefined,
    scheduledDate: (created?.scheduled_date as string | undefined) ?? null,
    startTime: (created?.start_time as string | undefined) ?? null,
  });

  return NextResponse.json({ visitId: newVisitId });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await authedClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;
  if (!z.string().uuid().safeParse(visitId).success) {
    return NextResponse.json({ error: "Invalid visit id" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("crm_remove_visit_crew", { p_visit_id: visitId });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ ok: true });
}
