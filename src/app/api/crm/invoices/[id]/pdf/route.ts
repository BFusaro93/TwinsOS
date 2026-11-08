import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { renderInvoicePDF } from "@/lib/invoices/pdf-data";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";

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

  // Same gate the invoice list/photos routes use: RLS is org-wide, so without
  // this any org login (a crew account included) could download every invoice.
  if (!(await hasAnySettingsPermission(supabase, ["acct_view_invoice_list", "acct_add_modify_invoices", "acct_send_invoices"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Explicit org filter as defense-in-depth alongside RLS — per CLAUDE.md,
  // org_id must always be scoped from the session, not implicit trust in a
  // policy that could itself change (e.g. a future crew-role RLS carve-out).
  // my_org_id() (not profiles.org_id) so staff impersonating a customer org
  // resolve to that org — profiles.org_id is the staff member's own org, which
  // made every invoice of the impersonated org come back "not found".
  const { data: orgId } = await supabase.rpc("my_org_id");
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await renderInvoicePDF(supabase, id, orgId, user.id);
    if (!result) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    return new NextResponse(result.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="invoice-${result.invoiceNumber}.pdf"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    console.error("PDF render error:", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
