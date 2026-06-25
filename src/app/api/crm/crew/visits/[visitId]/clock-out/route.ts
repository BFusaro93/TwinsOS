import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({
  notes: z.string().optional(),
});

export async function POST(
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
  const body = await request.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  const notes = parsed.success ? parsed.data.notes : undefined;
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (supabase as any)
    .from("crm_job_visits")
    .select("clocked_in_at")
    .eq("id", visitId)
    .single();

  const clockedInAt = existing.data?.clocked_in_at as string | null;
  let actualHours: number | null = null;
  if (clockedInAt) {
    const diffMs = new Date(now).getTime() - new Date(clockedInAt).getTime();
    actualHours = Math.round((diffMs / 3_600_000) * 100) / 100;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_visits")
    .update({
      clocked_out_at:   now,
      completed_at:     now,
      status:           "completed",
      actual_hours:     actualHours,
      completion_notes: notes ?? null,
      updated_at:       now,
    })
    .eq("id", visitId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
