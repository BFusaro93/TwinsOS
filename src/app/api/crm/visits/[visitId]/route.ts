import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { notifyVisitAssigned, notifyVisitNote } from "@/lib/notifications/visit-notify";

const PatchSchema = z.object({
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.string().optional(),
  crew_id: z.string().uuid().nullable().optional(),
  priority: z.number().int().optional(),
  notes_to_crew: z.string().nullable().optional(),
  invoice_description: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;

  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_visits")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", visitId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Push notifications — best-effort, never block the response on these.
  // Only fire when the patch actually touched the relevant field (not just
  // whenever crew_id/notes_to_crew happen to be non-null on the row).
  //
  // crm_crews has no org-scoped FK to crm_job_visits, so a caller could pass
  // a crew_id belonging to a different org and the update above would still
  // succeed (RLS on crm_job_visits only checks this visit's own org_id) —
  // that would leak this org's client name/schedule to another org's crew
  // member. Re-check the crew via the RLS-scoped `supabase` client (not the
  // admin client) so a cross-org id resolves to nothing before notifying.
  if (parsed.data.crew_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: crew } = await (supabase as any)
      .from("crm_crews")
      .select("id")
      .eq("id", parsed.data.crew_id)
      .maybeSingle();
    if (crew) {
      void notifyVisitAssigned({
        visitId,
        crewId: parsed.data.crew_id,
        clientId: data?.client_id as string | undefined,
        scheduledDate: (data?.scheduled_date as string | undefined) ?? null,
        startTime: (data?.start_time as string | undefined) ?? null,
      });
    }
  }
  if (parsed.data.notes_to_crew && data?.crew_id) {
    void notifyVisitNote({
      visitId,
      crewId: data.crew_id as string,
      clientId: data?.client_id as string | undefined,
      note: parsed.data.notes_to_crew,
    });
  }

  return NextResponse.json(data);
}
