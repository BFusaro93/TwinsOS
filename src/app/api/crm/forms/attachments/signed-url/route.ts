import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// POST /api/crm/forms/attachments/signed-url — staff-only attachment download.
// The form-attachments bucket is private with no SELECT policy for anon/
// authenticated roles (see 20260806000006_form_attachments_bucket.sql), so
// the only way to read an uploaded file back is a signed URL minted here —
// after verifying the path's form actually belongs to the caller's org.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const path = body.path as string | undefined;
  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const formId = path.split("/")[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: form } = await (supabase as any)
    .from("crm_forms")
    .select("id")
    .eq("id", formId)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const service = createServiceClient();
  const { data: signed, error } = await service.storage
    .from("form-attachments")
    .createSignedUrl(path, 60 * 60); // 1 hour

  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "Failed to sign URL" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
