import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: estimateId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estimate, error: estimateError } = await (supabase as any)
    .from("estimates")
    .select("id, org_id")
    .eq("id", estimateId)
    .single();

  if (estimateError || !estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const caption = formData.get("caption") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files can be attached as photos" }, { status: 400 });
  }

  // file.name is client-controlled and can contain "/"/".." segments —
  // restrict the extracted extension to a safe charset before it lands in
  // a storage path, or a crafted name could traverse out of this org's
  // prefix in the shared "attachments" bucket (same class of bug fixed in
  // the crew-app photos route).
  const rawExt = file.name.split(".").pop() ?? "jpg";
  const ext = /^[a-zA-Z0-9]{1,10}$/.test(rawExt) ? rawExt : "jpg";
  const storagePath = `estimate-photos/${estimate.org_id}/${estimateId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: uploadError } = await (supabase as any).storage
    .from("attachments")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("estimate_photos")
    .insert({
      org_id:       estimate.org_id,
      estimate_id:  estimateId,
      storage_path: storagePath,
      file_name:    file.name,
      file_size:    file.size,
      mime_type:    file.type,
      caption:      caption || null,
      uploaded_by:  user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: estimateId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("estimate_photos")
    .select("*")
    .eq("estimate_id", estimateId)
    .is("deleted_at", null)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Signed URLs are generated at read time — storage paths never leave the DB raw
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
