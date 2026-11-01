import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveEstimateDocument } from "@/lib/estimates/resolve-estimate-document";

/** The estimate document (proposal layout) that applies to this estimate, with its
 *  linked Estimate Email settings. `{ document: null }` = built-in layout / flow. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await resolveEstimateDocument(supabase, id);
  if (!doc) return NextResponse.json({ document: null });
  return NextResponse.json({
    document: {
      id: doc.id,
      name: doc.name,
      estimateEmailDocumentId: doc.estimate_email_document_id,
      includePdf: doc.include_pdf,
    },
  });
}
