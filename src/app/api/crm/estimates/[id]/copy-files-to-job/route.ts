import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { sanitizeStorageFileName } from "@/lib/hooks/use-attachments";
import { logger } from "@/lib/logger";

const log = logger.child("estimate-copy-files-to-job");

const BodySchema = z.object({ jobId: z.string().uuid() });

/**
 * POST /api/crm/estimates/[id]/copy-files-to-job — copies an estimate's photos and
 * attached files onto the job converted from it, so the crew sees the estimator's
 * site photos.
 *
 * This runs on the server because estimate photos have no `attachments` row: the
 * bucket's SELECT policy only exposes objects that have one, so a copy made with the
 * user's session was refused for every photo and only plain attachments came across.
 * The caller must be able to read both the estimate and the job through their own RLS,
 * and the job must be the one created from this estimate; only then does the service
 * client copy the objects, inside the org's own folder.
 *
 * Safe to call twice: each copy has a fixed path per source file, and a path that is
 * already attached to the job is skipped.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  const { jobId } = parsed.data;
  const { id: estimateId } = await params;

  // Both reads go through the caller's RLS: an estimate or job they can't see is a 404.
  const [{ data: estimate }, { data: job }] = await Promise.all([
    supabase.from("estimates").select("id, org_id").eq("id", estimateId).is("deleted_at", null).maybeSingle(),
    supabase.from("crm_jobs").select("id, org_id, estimate_id").eq("id", jobId).is("deleted_at", null).maybeSingle(),
  ]);
  const est = estimate as { id: string; org_id: string } | null;
  const jb = job as { id: string; org_id: string; estimate_id: string | null } | null;
  if (!est || !jb) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (jb.org_id !== est.org_id || jb.estimate_id !== est.id) {
    return NextResponse.json({ error: "That job wasn't created from this estimate" }, { status: 409 });
  }
  const orgId = est.org_id;

  const admin = createServiceClient();
  const [{ data: photos }, { data: files }, { data: existing }] = await Promise.all([
    admin.from("estimate_photos")
      .select("id, storage_path, file_name, file_size, mime_type")
      .eq("estimate_id", estimateId).eq("org_id", orgId).is("deleted_at", null),
    admin.from("attachments")
      .select("id, storage_path, file_name, file_size, file_type")
      .eq("record_type", "estimate").eq("record_id", estimateId).eq("org_id", orgId).is("deleted_at", null),
    admin.from("attachments")
      .select("storage_path")
      .eq("record_type", "job").eq("record_id", jobId).eq("org_id", orgId).is("deleted_at", null),
  ]);

  type Source = { id: string; storage_path: string; file_name: string; file_size: number | null; file_type: string | null };
  const sources: Source[] = [
    ...((photos ?? []) as { id: string; storage_path: string; file_name: string | null; file_size: number | null; mime_type: string | null }[])
      .map((p) => ({ id: p.id, storage_path: p.storage_path, file_name: p.file_name || "photo.jpg", file_size: p.file_size, file_type: p.mime_type })),
    ...((files ?? []) as Source[]),
  ].filter((s) => !!s.storage_path && s.storage_path.startsWith(`${orgId}/`));

  const already = new Set(((existing ?? []) as { storage_path: string }[]).map((a) => a.storage_path));
  let copied = 0;
  let failed = 0;
  for (const source of sources) {
    // One fixed destination per source file, so a retry doesn't attach it twice.
    const newPath = `${orgId}/job/${jobId}/from-estimate/${source.id}-${sanitizeStorageFileName(source.file_name)}`;
    if (already.has(newPath)) continue;
    const { error: copyError } = await admin.storage.from("attachments").copy(source.storage_path, newPath);
    if (copyError && !/already exists/i.test(copyError.message)) {
      failed++;
      log.warn("copy failed", { estimateId, jobId, error: copyError.message });
      continue;
    }
    const { error: insertError } = await admin.from("attachments").insert({
      org_id: orgId,
      created_by: user.id,
      record_type: "job",
      record_id: jobId,
      file_name: source.file_name,
      file_size: source.file_size ?? 0,
      file_type: source.file_type ?? "",
      storage_path: newPath,
      uploaded_by_name: "Transferred from estimate",
    });
    if (insertError) {
      failed++;
      log.warn("attachment insert failed", { estimateId, jobId, error: insertError.message });
      continue;
    }
    copied++;
  }

  return NextResponse.json({ copied, failed });
}
