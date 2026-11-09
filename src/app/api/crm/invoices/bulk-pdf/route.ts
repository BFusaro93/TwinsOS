import { NextRequest, NextResponse } from "next/server";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { BULK_PRINT_MAX } from "@/lib/bulk-print";
import { renderInvoicesPDF } from "@/lib/invoices/pdf-data";
import { logger } from "@/lib/logger";

const log = logger.child("invoices bulk pdf");

export const maxDuration = 300;

const BodySchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(BULK_PRINT_MAX) });

// Combines several invoices into one PDF for the Invoices list's "Print
// Selected" bulk action — same auth/org-scoping shape as the single-invoice
// route. Ids come in a POST body (a GET with a few hundred ids in the query
// string ran past the URL limit). The X-Rendered-Ids header lists the invoices
// actually in the PDF; the list marks only those printed and locked, since an
// invoice that failed to load never reached paper.
export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: `Choose between 1 and ${BULK_PRINT_MAX} invoices` }, { status: 400 });
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

  // Same gate the invoice list/photos routes use: RLS is org-wide, so without
  // this any org login (a crew account included) could download every invoice.
  if (!(await hasAnySettingsPermission(supabase, ["acct_view_invoice_list", "acct_add_modify_invoices", "acct_send_invoices"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // my_org_id() (not profiles.org_id) so staff impersonating a customer org
  // resolve to that org — profiles.org_id is the staff member's own org, which
  // made every invoice of the impersonated org come back "not found".
  const { data: orgId } = await supabase.rpc("my_org_id");
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rendered = await renderInvoicesPDF(supabase, ids, orgId, user.id);
    if (!rendered) {
      return NextResponse.json({ error: "None of the selected invoices could be loaded" }, { status: 404 });
    }

    return new NextResponse(rendered.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="invoices-${rendered.renderedIds.length}.pdf"`,
        "Cache-Control": "private, no-cache",
        "X-Rendered-Ids": rendered.renderedIds.join(","),
      },
    });
  } catch (err) {
    log.error("PDF render error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
