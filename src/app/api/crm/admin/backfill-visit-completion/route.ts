import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { applyVisitCompletionSideEffects } from "@/lib/visits/complete-visit-side-effects";

/**
 * One-off repair for visits that were marked completed WITHOUT the completion
 * side effects running — historically every visit clocked out from the crew
 * app (see crew/visits/[visitId]/clock-out), which never auto-invoiced, never
 * logged the "Visit completed" timeline row and never fired automations.
 *
 * Admin-only, scoped to the caller's org. Re-runs applyVisitCompletionSideEffects
 * for each visit id; the helper itself refuses to double-bill (a visit with an
 * existing crm_invoice_line_items.visit_id is skipped) and, with
 * dedupeActivity, won't duplicate an existing timeline row. Automations are
 * NOT fired unless `fireAutomations: true` is passed — a follow-up sequence
 * days after the fact is usually not wanted.
 *
 * POST /api/crm/admin/backfill-visit-completion
 * { "visitIds": ["<uuid>", ...], "fireAutomations"?: boolean }
 */
const Body = z.object({
  visitIds: z.array(z.string().uuid()).min(1).max(200),
  fireAutomations: z.boolean().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();
  const orgId = profile?.org_id ?? null;
  if (!orgId || profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Service client for the writes (same as the crew path), but every visit is
  // first confirmed to be a completed, non-deleted visit in the ADMIN's org —
  // ids from another org are reported as not_found, never touched.
  const admin = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visits } = await (admin as any)
    .from("crm_job_visits")
    .select("id, status")
    .in("id", parsed.data.visitIds)
    .eq("org_id", orgId)
    .is("deleted_at", null);
  const byId = new Map(((visits ?? []) as { id: string; status: string }[]).map((v) => [v.id, v]));

  const results: Record<string, unknown>[] = [];
  for (const visitId of parsed.data.visitIds) {
    const v = byId.get(visitId);
    if (!v) {
      results.push({ visitId, skipped: "not_found" });
      continue;
    }
    if (v.status !== "completed") {
      results.push({ visitId, skipped: `status_${v.status}` });
      continue;
    }
    const r = await applyVisitCompletionSideEffects({
      supabase: admin,
      orgId,
      visitId,
      userId: user.id,
      dedupeActivity: true,
      fireAutomations: parsed.data.fireAutomations ?? false,
    });
    results.push({ visitId, ...r });
  }

  return NextResponse.json({ ok: true, results });
}
