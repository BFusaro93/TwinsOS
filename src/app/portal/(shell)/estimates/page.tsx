import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPublishedProposal } from "@/lib/estimates/proposal-content";
import PortalEstimatesPage from "@/components/portal/PortalEstimatesPage";
import { toDisplaySettings } from "@/lib/estimate-display-settings";

interface LineItemRow {
  id: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  visits: number | null;
  total_cents: number;
  status: string;
  row_type: "item" | "section" | null;
  section_name: string | null;
  tier: string | null;
}

interface EstimateRow {
  id: string;
  estimate_number: string;
  title: string | null;
  total_price_cents: number;
  status: string;
  expires_at: string | null;
  created_at: string;
  display_settings: unknown;
  tiers_enabled: boolean | null;
  tier_labels: { basic?: string; standard?: string; premium?: string } | null;
  line_items: LineItemRow[];
}

export default async function EstimatesPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = await createClient();

  // PortalShell only hides the nav link when disabled — that's not
  // enforcement, so a direct/bookmarked visit must also be blocked here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (supabase as any)
    .from("client_portal_settings")
    .select("allow_estimates")
    .eq("org_id", ctx.orgId)
    .single() as { data: { allow_estimates: boolean } | null };
  if (settings?.allow_estimates === false) redirect("/portal");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estimates } = await (supabase as any)
    .from("estimates")
    .select(
      "id, estimate_number, title:description, total_price_cents:total_cents, status:stage, expires_at:valid_until_date, created_at, display_settings, tiers_enabled, tier_labels, " +
        "line_items:estimate_line_items(id, description:estimate_desc, quantity:qty, unit_price_cents:rate_cents, visits, total_cents, status, sort_order, row_type, section_name, tier)"
    )
    .eq("client_id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    // Draft and Quote (ready but not yet sent) are internal stages — the
    // customer only sees an estimate once it has been sent.
    .not("stage", "in", "(draft,quote)")
    .is("deleted_at", null)
    .is("estimate_line_items.deleted_at", null)
    .order("created_at", { ascending: false })
    .order("sort_order", { referencedTable: "estimate_line_items", ascending: true })
    .limit(50) as { data: EstimateRow[] | null };

  // A sent estimate shows the version the client was sent, not edits the
  // office hasn't sent yet (see lib/estimates/proposal-content.ts). The
  // versions table is staff-only under RLS, so read it with the service
  // client — every estimate here is already scoped to this client above.
  const service = createServiceClient();
  const normalized = await Promise.all((estimates ?? []).map(async (e) => {
    const published = e.status === "sent" ? await getPublishedProposal(service, e.id) : null;
    if (published) {
      const c = published.content;
      return {
        ...e,
        title: c.description,
        total_price_cents: c.totalCents,
        expires_at: c.validUntil,
        display_settings: c.displaySettings,
        tiers_enabled: c.tiersEnabled,
        tier_labels: c.tierLabels,
        line_items: c.lineItems.map((li) => ({
          id: li.id,
          description: li.estimateDesc ?? li.serviceName ?? "",
          quantity: li.qty,
          unit_price_cents: li.rateCents,
          visits: li.visits,
          total_cents: li.totalCents,
          status: li.status,
          row_type: li.rowType,
          section_name: li.sectionName,
          tier: li.tier,
        })),
      };
    }
    return {
      ...e,
      tiers_enabled: e.tiers_enabled ?? false,
      tier_labels: {
        basic: e.tier_labels?.basic ?? "Basic",
        standard: e.tier_labels?.standard ?? "Standard",
        premium: e.tier_labels?.premium ?? "Premium",
      },
      display_settings: toDisplaySettings(e.display_settings),
      line_items: e.line_items.map((li) => ({ ...li, description: li.description ?? "" })),
    };
  }));

  return <PortalEstimatesPage estimates={normalized} />;
}
