import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { recalcNextPackageVisitDate } from "@/lib/package-visit-recalc";
import { isoNy } from "@/lib/reports/ny-date";
import { applyVisitCompletionSideEffects } from "@/lib/visits/complete-visit-side-effects";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  const orgId: string | null = (profile as { org_id: string | null } | null)?.org_id ?? null;

  const { visitId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit, error: visitErr } = await (supabase as any)
    .from("crm_job_visits")
    .select("job_id, client_id, invoice_description, scheduled_date, status, job_service_id")
    .eq("id", visitId)
    .single();

  if (visitErr || !visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  // Idempotent: a visit already marked completed must not re-run the
  // side effects below (duplicate activity-timeline entries, duplicate
  // auto-invoices) if this route is called again for it — e.g. a repeat
  // "Mark Complete" click before the UI reflects the first one.
  if ((visit as { status: string }).status === "completed") {
    return NextResponse.json({ ok: true, jobId: (visit as { job_id: string }).job_id, clientId: (visit as { client_id: string }).client_id, alreadyCompleted: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: vErr } = await (supabase as any)
    .from("crm_job_visits")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", visitId);

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

  // Push the next package-sequenced visit's date out if this one completed later
  // than its static schedule assumed. Non-fatal — a failure here shouldn't block
  // the rest of the completion flow (invoicing, activity logging).
  try {
    await recalcNextPackageVisitDate(
      supabase,
      (visit as { job_service_id: string | null }).job_service_id,
      isoNy(new Date())
    );
  } catch (err) {
    console.error("[visits/complete] package min_days recalc failed:", err);
  }

  // Job bookkeeping, auto-invoice, activity-timeline row and automation
  // triggers live in the shared helper so the crew clock-out route bills a
  // field-completed visit identically. Pass this request's RLS-scoped client
  // so office completions keep evaluating under the caller's own policies.
  if (!orgId) {
    return NextResponse.json({ ok: true, jobId: (visit as { job_id: string }).job_id, clientId: (visit as { client_id: string | null }).client_id });
  }
  const sideEffects = await applyVisitCompletionSideEffects({
    supabase,
    orgId,
    visitId,
    userId: user.id,
  });
  if (!sideEffects.ok && sideEffects.error) {
    return NextResponse.json({ error: sideEffects.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, jobId: sideEffects.jobId, clientId: sideEffects.clientId });
}
