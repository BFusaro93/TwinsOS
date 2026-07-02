import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createClient } from "@/lib/supabase/server";
import PortalEstimatesPage from "@/components/portal/PortalEstimatesPage";

interface EstimateRow {
  id: string;
  estimate_number: string;
  title: string | null;
  total_price_cents: number;
  status: string;
  expires_at: string | null;
  created_at: string;
}

export default async function EstimatesPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estimates } = await (supabase as any)
    .from("estimates")
    .select("id, estimate_number, title:description, total_price_cents:total_cents, status:stage, expires_at:valid_until_date, created_at")
    .eq("client_id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50) as { data: EstimateRow[] | null };

  return <PortalEstimatesPage estimates={estimates ?? []} />;
}
