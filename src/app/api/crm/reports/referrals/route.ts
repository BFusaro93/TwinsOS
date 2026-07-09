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
      referrer:referred_by_client_id ( id, display_name )
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
      byReferrer.set(referrerId, {
        referrerId,
        referrerName: row.referrer?.display_name ?? "Unknown client",
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
