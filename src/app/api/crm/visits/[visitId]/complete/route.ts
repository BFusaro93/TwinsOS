import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(
  _request: Request,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit, error: visitErr } = await (supabase as any)
    .from("crm_job_visits")
    .select("job_id, client_id, invoice_description")
    .eq("id", visitId)
    .single();

  if (visitErr || !visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: vErr } = await (supabase as any)
    .from("crm_job_visits")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", visitId);

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

  // Only mark the parent job completed for one-time job types.
  // Recurring, package, project, snow, and waiting_list jobs have multiple visits
  // and should stay active until explicitly cancelled/closed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job } = await (supabase as any)
    .from("crm_jobs")
    .select("job_type")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq("id", (visit as any).job_id)
    .single();

  const oneTimeTypes = ["one_time"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (job && oneTimeTypes.includes((job as any).job_type)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: jErr } = await (supabase as any)
      .from("crm_jobs")
      .update({ status: "completed", is_complete: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("id", (visit as any).job_id);
    if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 });
  } else {
    // For recurring/multi-visit jobs, ensure status stays scheduled and stamp last service date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("crm_jobs")
      .update({ status: "scheduled", is_complete: false, last_service_date: new Date().toISOString().slice(0, 10) })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("id", (visit as any).job_id);
  }

  // Log visit completion to client activity timeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = visit as any;
  if (v.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("client_activity").insert({
      client_id: v.client_id,
      activity_type: "job",
      subject: `Visit completed${v.invoice_description ? `: ${v.invoice_description}` : ""}`,
      ref_id: v.job_id,
      ref_table: "crm_jobs",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ ok: true, jobId: (visit as any).job_id, clientId: v.client_id });
}
