import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { renderEstimatesPDF } from "@/lib/estimate-pdf";

// Combines several estimates into one PDF for the Estimates list's "Print
// Selected" bulk action — same auth/org-scoping shape as the single-estimate
// route, just taking ?ids=a,b,c instead of a path param.
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ error: "No estimate ids given" }, { status: 400 });
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const buffer = await renderEstimatesPDF(supabase, ids, profile.org_id);
  if (!buffer) {
    return NextResponse.json({ error: "None of the selected estimates could be loaded" }, { status: 404 });
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="estimates-${ids.length}.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
