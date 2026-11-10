import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { createServiceClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

/**
 * GET /api/crm/jobs/[jobId]/visit-photos
 *
 * The photos the crew took from the crew app (crm_visit_photos) for one job, newest first,
 * with signed URLs. Nothing in the office read this table before, so crew photos looked lost.
 *
 * The rows are read with the caller's own client (RLS scopes them to the caller's org, and the
 * job lookup proves the job is theirs); the files are signed with the service client because
 * the attachments bucket's SELECT policy only matches objects that have an `attachments` row,
 * which visit photos never have (same reason the crew photos route signs this way).
 */
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = supabase as AnyDb;

  const { data: hasCrm } = await db.rpc("has_crm_access");
  if (!hasCrm) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { jobId } = await params;
  const { data: job } = await db.from("crm_jobs").select("id").eq("id", jobId).is("deleted_at", null).maybeSingle();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const { data: rows, error } = await db
    .from("crm_visit_photos")
    .select("id, visit_id, storage_path, caption, created_at, crm_job_visits(scheduled_date)")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "Could not load photos" }, { status: 500 });

  type Row = { id: string; visit_id: string; storage_path: string; caption: string | null; created_at: string; crm_job_visits: { scheduled_date: string | null } | null };
  const list = (rows ?? []) as Row[];
  const { data: signed } = list.length
    ? await createServiceClient().storage.from("attachments").createSignedUrls(list.map((r) => r.storage_path), 3600)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return NextResponse.json({
    photos: list.map((r) => ({
      id: r.id,
      visitId: r.visit_id,
      visitDate: r.crm_job_visits?.scheduled_date ?? null,
      caption: r.caption,
      createdAt: r.created_at,
      url: urlByPath.get(r.storage_path) ?? null,
    })),
  });
}
