import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { AccountStatementDocument } from "@/components/crm/invoices/pdf/AccountStatementDocument";
import type { AccountStatementPDFData } from "@/components/crm/invoices/pdf/AccountStatementDocument";
import type { OrgPDFData } from "@/components/crm/invoices/pdf/InvoiceDocument";
import { buildAccountStatementData } from "@/lib/invoices/account-statement-data";
import { getMyTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todayISO(supabase: any): Promise<string> {
  // The statement's "as of" date must be the company's calendar day. This runs
  // on Vercel, whose Node runtime is UTC, so toISOString() would date a
  // statement pulled at 9pm Eastern as tomorrow — and at month end, put it in
  // the wrong month from the balances it was computed against.
  return todayInZone(await getMyTimeZone(supabase));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = req.nextUrl.searchParams;
  const today = await todayISO(supabase);
  const statementDate = searchParams.get("date") || today;
  const periodFrom = searchParams.get("from") || "2000-01-01";
  const periodTo = searchParams.get("to") || today;
  const message = searchParams.get("message") || null;
  const showDetail = searchParams.get("detail") !== "0";
  const minBalanceCentsParam = searchParams.get("minBalanceCents");
  const minBalanceCents = minBalanceCentsParam ? Number(minBalanceCentsParam) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client, error: clientErr } = await (supabase as any)
    .from("clients")
    .select("org_id, display_name, billing_address, billing_city, billing_state, billing_zip")
    .eq("id", clientId)
    .is("deleted_at", null)
    .single();

  if (clientErr || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const activity = await buildAccountStatementData(supabase, {
    clientId,
    orgId: client.org_id as string,
    fromDate: periodFrom,
    toDate: periodTo,
  });

  if (minBalanceCents != null && activity.endingBalanceCents < minBalanceCents) {
    return NextResponse.json(
      { error: "Balance below the minimum for a statement", endingBalanceCents: activity.endingBalanceCents },
      { status: 200 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("name, brand_color, address, customizations")
    .eq("id", client.org_id)
    .single();

  const addr = (org?.address as Record<string, string>) ?? {};
  const customizations = (org?.customizations as Record<string, unknown>) ?? {};

  const statementData: AccountStatementPDFData = {
    statementDate,
    periodFrom,
    periodTo,
    accountNumber: activity.accountNumber,
    clientName: (client.display_name as string) ?? null,
    clientAddress: (client.billing_address as string) ?? null,
    clientCity: (client.billing_city as string) ?? null,
    clientState: (client.billing_state as string) ?? null,
    clientZip: (client.billing_zip as string) ?? null,
    message,
    balanceForwardCents: activity.balanceForwardCents,
    rows: showDetail ? activity.rows : [],
    endingBalanceCents: activity.endingBalanceCents,
    lastPayment: activity.lastPayment,
  };

  const orgData: OrgPDFData = {
    name: (org?.name as string) ?? "",
    street: addr.street ?? "",
    city: addr.city ?? "",
    state: addr.state ?? "",
    zip: addr.zip ?? "",
    phone: addr.phone ?? "",
    brandColor: (org?.brand_color as string) || "#60ab45",
    logoUrl: (customizations.logoDataUrl as string) || null,
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createElement(AccountStatementDocument as any, { statement: statementData, org: orgData }) as any
    );

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="statement-${clientId}.pdf"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    console.error("Statement PDF render error:", err);
    return NextResponse.json({ error: "Failed to generate statement" }, { status: 500 });
  }
}
