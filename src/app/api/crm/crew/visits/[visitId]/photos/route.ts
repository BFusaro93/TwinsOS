import { NextResponse } from "next/server";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  // Accepts either the web app's cookie session or crew-app's bearer token —
  // see getRouteAuth(). This route previously only accepted the cookie
  // session, which meant the mobile app's photo upload always 401'd; the
  // crew-app offline queue (src/lib/offline/sync-engine.ts) depends on this.
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;

  // Get the visit to validate and get job_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit, error: visitError } = await (supabase as any)
    .from("crm_job_visits")
    .select("job_id, org_id, crew_id")
    .eq("id", visitId)
    .is("deleted_at", null)
    .single();

  if (visitError || !visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }
  if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit.crew_id))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const caption = formData.get("caption") as string | null;
  // Optional client-generated id (the crew-app offline queue's item id) —
  // when present it's used to key the storage path so a retried upload
  // (after a flaky partial-success) overwrites the same object and reuses
  // the same DB row instead of creating a duplicate photo. Requests without
  // it (e.g. the web app) fall back to the previous timestamp-based path.
  const rawClientId = formData.get("clientId") as string | null;
  // Both clientId and the file extension end up in the storage path below, so
  // they must be restricted to a safe charset — otherwise a caller could pass
  // something like "../otherOrgId/otherVisitId/x" and (with upsert forced on
  // for clientId requests) overwrite another org's object in the shared
  // "attachments" bucket.
  const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9_-]{1,100}$/;
  const clientId = rawClientId && SAFE_PATH_SEGMENT.test(rawClientId) ? rawClientId : null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Upload to Supabase Storage under visit-photos/{orgId}/{visitId}/{clientId-or-timestamp}.{ext}.
  // When clientId is present the path is fully deterministic for that queue item, so a retried
  // upload (after a flaky partial-success) reuses the same object/row instead of creating a
  // duplicate photo — no new column needed, just keying the existing path off the client id.
  const rawExt = file.name.split(".").pop() ?? "jpg";
  const ext = SAFE_PATH_SEGMENT.test(rawExt) ? rawExt : "jpg";
  const storagePath = `visit-photos/${visit.org_id}/${visitId}/${clientId ?? Date.now()}.${ext}`;

  if (clientId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingPhoto } = await (supabase as any)
      .from("crm_visit_photos")
      .select("*")
      .eq("storage_path", storagePath)
      .maybeSingle();
    if (existingPhoto) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: signed } = await (supabase as any).storage
        .from("attachments")
        .createSignedUrl(existingPhoto.storage_path, 3600);
      return NextResponse.json({ ...existingPhoto, signedUrl: signed?.signedUrl ?? null }, { status: 201 });
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: uploadError } = await (supabase as any).storage
    .from("attachments")
    .upload(storagePath, buffer, { contentType: file.type, upsert: !!clientId });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  // Insert record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_visit_photos")
    .insert({
      org_id:       visit.org_id,
      visit_id:     visitId,
      job_id:       visit.job_id,
      storage_path: storagePath,
      caption:      caption ?? null,
      uploaded_by:  user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: signed } = await (supabase as any).storage
    .from("attachments")
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json({ ...data, signedUrl: signed?.signedUrl ?? null }, { status: 201 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit } = await (supabase as any)
    .from("crm_job_visits")
    .select("org_id, crew_id")
    .eq("id", visitId)
    .is("deleted_at", null)
    .single();
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit.crew_id))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_visit_photos")
    .select("*")
    .eq("visit_id", visitId)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Generate signed URLs for each photo
  const photosWithUrls = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any[]).map(async (photo) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: signed } = await (supabase as any).storage
        .from("attachments")
        .createSignedUrl(photo.storage_path, 3600);
      return { ...photo, signedUrl: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json(photosWithUrls);
}
