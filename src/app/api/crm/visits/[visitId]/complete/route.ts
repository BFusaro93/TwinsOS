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
    .select("job_id, client_id, invoice_description, scheduled_date, status, completed_at, job_service_id")
    .eq("id", visitId)
    .single();

  if (visitErr || !visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const priorStatus = (visit as { status: string }).status;
  const priorCompletedAt = (visit as { completed_at: string | null }).completed_at;

  // A visit already marked completed re-runs the side effects rather than
  // short-circuiting. This used to return immediately, which permanently
  // poisoned any visit whose first completion marked the status and then
  // failed part-way: the retry saw "completed" and returned ok, so the
  // auto-invoice, last_service_date, timeline row and package recalc never
  // ran for it, ever. Re-running is safe — the invoice step is guarded by the
  // unique crm_invoice_line_items.visit_id, and dedupeActivity suppresses a
  // second timeline row — so a second "Mark Complete" now repairs the visit
  // instead of rubber-stamping it.
  //
  // Automations are deliberately NOT re-fired: if the first attempt got far
  // enough to enrol the client, re-firing would send duplicate customer
  // emails, which is a worse failure than a follow-up that never started.
  if (priorStatus === "completed") {
    if (!orgId) {
      return NextResponse.json({
        ok: true,
        jobId: (visit as { job_id: string }).job_id,
        clientId: (visit as { client_id: string | null }).client_id,
        alreadyCompleted: true,
      });
    }
    const repair = await applyVisitCompletionSideEffects({
      supabase,
      orgId,
      visitId,
      userId: user.id,
      dedupeActivity: true,
      fireAutomations: false,
    });
    return NextResponse.json({
      ok: true,
      jobId: repair.jobId ?? (visit as { job_id: string }).job_id,
      clientId: repair.clientId ?? (visit as { client_id: string | null }).client_id,
      alreadyCompleted: true,
      invoiced: repair.invoiced,
      invoiceSkipReason: repair.invoiceSkipReason,
    });
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
    // Put the visit back the way we found it. Completion and its side effects
    // are not one transaction, so leaving the status flipped after a hard
    // failure would hand the next attempt an "already completed" visit with no
    // invoice behind it. Restoring the prior status keeps the operation
    // genuinely retryable; the repair path above is the backstop if this
    // restore itself fails.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("crm_job_visits")
      .update({ status: priorStatus, completed_at: priorCompletedAt })
      .eq("id", visitId);
    return NextResponse.json({ error: sideEffects.error }, { status: 500 });
  }

  // invoiceSkipReason "error" means auto-invoicing threw and was swallowed so
  // it wouldn't take the timeline row down with it. Surfacing it lets the
  // caller tell the user the visit completed but was not billed, instead of
  // the failure living only in the server log.
  return NextResponse.json({
    ok: true,
    jobId: sideEffects.jobId,
    clientId: sideEffects.clientId,
    invoiced: sideEffects.invoiced,
    invoiceSkipReason: sideEffects.invoiceSkipReason,
  });
}
