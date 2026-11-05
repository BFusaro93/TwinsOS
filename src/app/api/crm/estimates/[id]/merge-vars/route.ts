import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { loadEstimateDocumentMergeVars } from "@/lib/estimates/estimate-document-render";

/** Raw merge values for this estimate (client, property, company, estimate tags),
 *  read under the caller's RLS — so the Send Estimate preview shows what the
 *  email will actually say instead of a hand-picked subset of tags. */
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

  const vars = await loadEstimateDocumentMergeVars(supabase, id, { html: false });
  return NextResponse.json({ vars });
}
