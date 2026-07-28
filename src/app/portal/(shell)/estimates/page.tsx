import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createClient } from "@/lib/supabase/server";
import PortalEstimatesPage from "@/components/portal/PortalEstimatesPage";

interface LineItemRow {
  id: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  status: string;
}

interface EstimateRow {
  id: string;
  estimate_number: string;
  title: string | null;
  total_price_cents: number;
  status: string;
  expires_at: string | null;
  created_at: string;
  line_items: LineItemRow[];
}

export default async function EstimatesPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estimates } = await (supabase as any)
    .from("estimates")
    .select(
      "id, estimate_number, title:description, total_price_cents:total_cents, status:stage, expires_at:valid_until_date, created_at, " +
        "line_items:estimate_line_items(id, description:estimate_desc, quantity:qty, unit_price_cents:rate_cents, status, sort_order)"
    )
    .eq("client_id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .is("estimate_line_items.deleted_at", null)
    .order("created_at", { ascending: false })
    .order("sort_order", { referencedTable: "estimate_line_items", ascending: true })
    .limit(50) as { data: EstimateRow[] | null };

  const normalized = (estimates ?? []).map((e) => ({
    ...e,
    line_items: e.line_items.map((li) => ({ ...li, description: li.description ?? "" })),
  }));

  return <PortalEstimatesPage estimates={normalized} />;
}
