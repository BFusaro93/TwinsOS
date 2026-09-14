import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export interface ReferredClientRow {
  id: string;
  displayName: string;
  status: string;
  clientSince: string | null;
  balanceOutstandingCents: number;
}

export interface ReferralReportRow {
  referrerId: string;
  referrerName: string;
  referredClients: ReferredClientRow[];
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same gate the Report Center applies to the "Client Referral" report
  // (REPORT_PERMISSION_KEYS["client-referral"]) — this page shows the same
  // balances/referral data, so it must not be reachable with a bare login.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allowed } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "crm_rpt_client_referral",
  });
  if (allowed !== true) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("clients")
    .select(`
      id,
      display_name,
      status,
      client_since,
      created_at,
      balance_outstanding_cents,
      referred_by_client_id,
      referrer:referred_by_client_id ( id, display_name, deleted_at )
    `)
    .is("deleted_at", null)
    .not("referred_by_client_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byReferrer = new Map<string, ReferralReportRow>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    const referrerId = row.referred_by_client_id as string;
    if (!byReferrer.has(referrerId)) {
      // A soft-deleted referrer still exists as the FK target — attribute
      // the referred clients to it, but don't surface its (deleted) name.
      const referrerDeleted = Boolean(row.referrer?.deleted_at);
      byReferrer.set(referrerId, {
        referrerId,
        referrerName: !referrerDeleted && row.referrer?.display_name ? row.referrer.display_name : "Unknown client",
        referredClients: [],
      });
    }
    byReferrer.get(referrerId)!.referredClients.push({
      id: row.id,
      displayName: row.display_name,
      status: row.status,
      clientSince: row.client_since ?? row.created_at,
      balanceOutstandingCents: row.balance_outstanding_cents ?? 0,
    });
  }

  const rows = Array.from(byReferrer.values()).sort(
    (a, b) => b.referredClients.length - a.referredClients.length
  );

  return NextResponse.json({ rows });
}
