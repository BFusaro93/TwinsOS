import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { renderEstimatePDF } from "@/lib/estimate-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Explicit org filter as defense-in-depth alongside RLS — same rationale
  // as the invoice PDF route (per CLAUDE.md, org_id must always be scoped
  // from the session, not implicit trust in a policy that could itself
  // change, e.g. a future crew-role RLS carve-out).
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── fetch estimate number for the filename, then render ────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: est, error: estErr } = await (supabase as any)
    .from("estimates")
    .select("estimate_number")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .single();

  if (estErr || !est) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const buffer = await renderEstimatePDF(supabase, id, profile.org_id);
  if (!buffer) {
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="estimate-${est.estimate_number}.pdf"`,
      "Cache-Control": "private, no-cache",
    },
  });
}
