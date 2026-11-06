import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { BULK_PRINT_MAX } from "@/lib/bulk-print";
import { renderEstimatesPDF } from "@/lib/estimate-pdf";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";

export const maxDuration = 300;

const BodySchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(BULK_PRINT_MAX) });

// Combines several estimates into one PDF for the Estimates list's "Print
// Selected" bulk action — same auth/org-scoping shape as the single-estimate
// route. Ids come in a POST body (a GET with a few hundred ids in the query
// string ran past the URL limit).
export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: `Choose between 1 and ${BULK_PRINT_MAX} estimates` }, { status: 400 });
  }
  const ids = Array.from(new Set(parsed.data.ids));

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (profile) profile.org_id = (await getEffectiveOrgId(supabase)) ?? profile.org_id;
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
