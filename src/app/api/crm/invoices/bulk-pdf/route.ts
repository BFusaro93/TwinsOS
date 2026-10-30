import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { renderInvoicesPDF } from "@/lib/invoices/pdf-data";

// Combines several invoices into one PDF for the Invoices list's "Print
// Selected" bulk action — same auth/org-scoping shape as the single-invoice
// route, just taking ?ids=a,b,c instead of a path param. The lock +
// draft->printed side effect stays in the client (InvoicesList.bulkPrintSelected)
// since it's a UI-triggered mutation, not something a GET route should do.
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ error: "No invoice ids given" }, { status: 400 });
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // my_org_id() (not profiles.org_id) so staff impersonating a customer org
  // resolve to that org — profiles.org_id is the staff member's own org, which
  // made every invoice of the impersonated org come back "not found".
  const { data: orgId } = await supabase.rpc("my_org_id");
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const buffer = await renderInvoicesPDF(supabase, ids, orgId, user.id);
    if (!buffer) {
      return NextResponse.json({ error: "None of the selected invoices could be loaded" }, { status: 404 });
    }

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="invoices-${ids.length}.pdf"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    console.error("PDF render error:", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
