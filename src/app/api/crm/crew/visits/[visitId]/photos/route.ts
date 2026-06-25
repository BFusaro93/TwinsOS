import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

  // Get the visit to validate and get job_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit, error: visitError } = await (supabase as any)
    .from("crm_job_visits")
    .select("job_id, org_id")
    .eq("id", visitId)
    .single();

  if (visitError || !visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const caption = formData.get("caption") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // Upload to Supabase Storage under visit-photos/{orgId}/{visitId}/{timestamp}-{filename}
  const ext = file.name.split(".").pop() ?? "jpg";
  const storagePath = `visit-photos/${visit.org_id}/${visitId}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: uploadError } = await (supabase as any).storage
    .from("attachments")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

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
  return NextResponse.json(data, { status: 201 });
}

export async function GET(
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
