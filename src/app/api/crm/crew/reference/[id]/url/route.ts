import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { adminClient } from "@/lib/api/auth";

/** GET — a five-minute signed link to one Reference Library document the crew may see. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const db = adminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (db as any).from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!profile?.org_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: doc } = await (db as any)
    .from("crm_reference_documents")
    .select("storage_path, mime_type, file_name")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .eq("visible_to_crew", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: signed, error } = await db.storage.from("reference-library").createSignedUrl(doc.storage_path, 300);
  if (error || !signed) return NextResponse.json({ error: "Couldn't open the document" }, { status: 500 });
  return NextResponse.json({ url: signed.signedUrl, mimeType: doc.mime_type, fileName: doc.file_name });
}
