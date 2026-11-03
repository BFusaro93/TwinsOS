import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { adminClient } from "@/lib/api/auth";

/**
 * GET — the company's Reference Library documents the crew may see (labels, Safety Data Sheets,
 * SOPs, training). Read with the service role scoped to the caller's own organization, because
 * crew logins can't read the library tables directly. Customers (portal accounts have no profile
 * row) get nothing.
 */
export async function GET(request: Request) {
  const { user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (db as any).from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!profile?.org_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("crm_reference_documents")
    .select("id, category, title, description, file_name, mime_type, size_bytes, revision_date, product_ids")
    .eq("org_id", profile.org_id)
    .eq("visible_to_crew", true)
    .is("deleted_at", null)
    .order("title");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json((data as any[]).map((d) => ({
    id: d.id,
    category: d.category,
    title: d.title,
    description: d.description,
    fileName: d.file_name,
    mimeType: d.mime_type,
    sizeBytes: d.size_bytes,
    revisionDate: d.revision_date,
    productIds: d.product_ids ?? [],
  })));
}
