import { redirect } from "next/navigation";
import { getPortalAccounts, getPortalContext, subAccountNames } from "@/lib/portal/get-portal-context";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPublishedProposal } from "@/lib/estimates/proposal-content";
import PortalEstimatesPage from "@/components/portal/PortalEstimatesPage";
import { toDisplaySettings } from "@/lib/estimate-display-settings";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { byColumn, queryByClientIds } from "@/lib/portal/client-id-chunks";
import { estimateDepositDueCents, estimatesSettledByInvoices, isEstimateAccepted } from "@/lib/estimates/deposit-due";

interface LineItemRow {
  id: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  adj_rate_cents?: number | null;
  visits: number | null;
  total_cents: number;
  status: string;
  row_type: "item" | "section" | null;
  section_name: string | null;
  service_name?: string | null;
  tier: string | null;
  package_id: string | null;
  discount_cents: number | null;
  subitems?: { total_cents: number | null; deleted_at: string | null }[] | null;
}

interface EstimateRow {
  id: string;
  client_id: string;
  estimate_number: string;
  title: string | null;
  total_price_cents: number;
  status: string;
  expires_at: string | null;
  created_at: string;
  display_settings: unknown;
  tiers_enabled: boolean | null;
  tier_labels: { basic?: string; standard?: string; premium?: string } | null;
  discount_cents: number | null;
  discount_type: "percent" | "flat" | null;
  discount_value: number | null;
  tax_rate_bps: number | null;
  deposit_required_cents: number | null;
  deposit_collected_cents: number | null;
  deposit_pending_cents: number | null;
  deposit_waived_at: string | null;
  portal_accepted_at: string | null;
  line_items: LineItemRow[];
}

export default async function EstimatesPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = await createClient();

  // PortalShell only hides the nav link when disabled — that's not
  // enforcement, so a direct/bookmarked visit must also be blocked here.
  // Service client: portal users have no RLS path to client_portal_settings, so the
  // session read always came back null and the block never applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settings } = await (createServiceClient() as any)
    .from("client_portal_settings")
    .select("allow_estimates")
    .eq("org_id", ctx.orgId)
    .single() as { data: { allow_estimates: boolean } | null };
  if (settings?.allow_estimates === false) redirect("/portal");

  // Portal customers have NO RLS read path to estimates/estimate_line_items
  // (a direct PostgREST read would expose cost, margin and internal-note
  // columns and every draft), so read with the service client, scoped here to
  // this client (and its sub-accounts) + org and to client-safe columns only.
  const service = createServiceClient();
  const accounts = await getPortalAccounts(ctx);
  const accountNames = subAccountNames(accounts);
  const { data: estimates } = await queryByClientIds<EstimateRow>(
    accounts.map((a) => a.id),
    (ids) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any)
        .from("estimates")
        .select(
          "id, client_id, estimate_number, title:description, total_price_cents:total_cents, status:stage, expires_at:valid_until_date, created_at, display_settings, tiers_enabled, tier_labels, " +
            "discount_cents, discount_type, discount_value, tax_rate_bps, " +
            "deposit_required_cents, deposit_collected_cents, deposit_pending_cents, deposit_waived_at, portal_accepted_at, " +
            "line_items:estimate_line_items(id, description:estimate_desc, quantity:qty, unit_price_cents:rate_cents, adj_rate_cents, visits, total_cents, discount_cents, status, sort_order, row_type, section_name, service_name, tier, package_id, subitems:estimate_line_item_subitems(total_cents, deleted_at))"
        )
        .in("client_id", ids)
        .eq("org_id", ctx.orgId)
        // Draft and Quote (ready but not yet sent) are internal stages — the
        // customer only sees an estimate once it has been sent.
        .not("stage", "in", "(draft,quote)")
        .is("deleted_at", null)
        .is("estimate_line_items.deleted_at", null)
        .order("created_at", { ascending: false })
        .order("sort_order", { referencedTable: "estimate_line_items", ascending: true })
        .limit(50) as Promise<{ data: EstimateRow[] | null; error: unknown }>,
    { compare: byColumn("created_at", false), limit: 50 }
  );

  // A sent estimate shows the version the client was sent, not edits the
  // office hasn't sent yet (see lib/estimates/proposal-content.ts). The
  // versions table is staff-only under RLS, so read it with the service
  // client — every estimate here is already scoped to this client above.
  const normalized = await Promise.all((estimates ?? []).map(async (e) => {
    const published = e.status === "sent" ? await getPublishedProposal(service, e.id, ctx.orgId) : null;
    if (published) {
      const c = published.content;
      const toPortalLine = (li: (typeof c.lineItems)[number], status: string) => ({
        id: li.id,
        // Wording only; the service name travels separately so the page can follow the
        // "Service name with description" toggle (a line with no wording falls back to its name).
        description: li.estimateDesc ?? "",
        service_name: li.serviceName ?? null,
        quantity: li.qty,
        // The rate the line is actually priced at (Adj Rate wins) — "Hide $0
        // prices" keys off this, so a line re-priced to $0 is hidden and a $0
        // catalog rate with a real Adj Rate is not.
        unit_price_cents: li.adjRateCents ?? li.rateCents,
        visits: li.visits,
        total_cents: li.totalCents,
        discount_cents: li.discountCents ?? 0,
        subitem_total_cents: li.subitemTotalCents ?? 0,
        status,
        package_id: li.packageId ?? null,
        row_type: li.rowType,
        section_name: li.sectionName,
        tier: li.tier,
      });
      return {
        ...e,
        title: c.description,
        total_price_cents: c.totalCents,
        expires_at: c.validUntil,
        display_settings: c.displaySettings,
        tiers_enabled: c.tiersEnabled,
        tier_labels: c.tierLabels,
        // The sent version's header discount / tax, so the Selected Total
        // matches what accepting records (see lib/estimates/proposal-totals).
        discount_cents: c.discountCents,
        discount_type: c.discountType,
        discount_value: c.discountValue,
        tax_rate_bps: c.taxRateBps,
        deposit_required_cents: c.depositRequiredCents,
        // Lines already agreed (status 'won') are shown as such, not offered.
        line_items: [
          ...c.lineItems.map((li) => toPortalLine(li, li.status)),
          ...(c.agreedLineItems ?? []).map((li) => toPortalLine(li, "won")),
        ],
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
      line_items: e.line_items.map(({ subitems, adj_rate_cents, ...li }) => ({
        ...li,
        // Effective rate: Adj Rate wins (see the published-version mapping above).
        unit_price_cents: adj_rate_cents ?? li.unit_price_cents,
        description: li.description ?? "",
        discount_cents: li.discount_cents ?? 0,
        subitem_total_cents: (subitems ?? []).filter((si) => !si.deleted_at).reduce((sum, si) => sum + (si.total_cents ?? 0), 0),
      })),
    };
  }));

  // A required deposit still owed on an accepted estimate (nothing collected
  // or clearing, not waived, the job not already invoiced and paid). Deposits
  // are optional, so accepting never waits on it — but it is shown as due,
  // with the proposal link to pay it online when one exists (an accepted link
  // never expires). estimateDepositDueCents is the same rule the proposal page
  // and the deposit-intent route use.
  const accepted = (e: (typeof normalized)[number]) =>
    isEstimateAccepted({ portalAcceptedAt: e.portal_accepted_at, stage: e.status });
  const settledIds = await estimatesSettledByInvoices(
    service,
    normalized.filter((e) => accepted(e) && (e.deposit_required_cents ?? 0) > 0 && !e.deposit_waived_at).map((e) => e.id)
  );
  const depositDue = (e: (typeof normalized)[number]) =>
    estimateDepositDueCents({
      accepted: accepted(e),
      stage: e.status,
      requiredCents: e.deposit_required_cents,
      collectedCents: e.deposit_collected_cents,
      pendingCents: e.deposit_pending_cents,
      totalCents: e.total_price_cents,
      waivedAt: e.deposit_waived_at,
      settledByInvoices: settledIds.has(e.id),
    });
  // The pay link is looked up for every estimate that can owe a deposit, not only ones already
  // accepted: a client who accepts here sees "Deposit due" immediately, and without the link
  // already loaded it read "we'll be in touch" until they reloaded the page.
  const dueIds = normalized
    .filter((e) =>
      (e.deposit_required_cents ?? 0) > 0 &&
      (e.deposit_collected_cents ?? 0) === 0 &&
      (e.deposit_pending_cents ?? 0) === 0 &&
      !e.deposit_waived_at &&
      !settledIds.has(e.id) &&
      !["lost", "declined"].includes(e.status)
    )
    .map((e) => e.id);
  const payUrlByEstimate = new Map<string, string>();
  if (dueIds.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tokenRows } = await (service as any)
      .from("estimate_share_tokens")
      .select("estimate_id, token, accepted_at, created_at")
      .in("estimate_id", dueIds)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .order("accepted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }) as { data: { estimate_id: string; token: string }[] | null };
    for (const t of tokenRows ?? []) {
      if (!payUrlByEstimate.has(t.estimate_id)) payUrlByEstimate.set(t.estimate_id, `/proposal/${t.token}`);
    }
  }

  // "Valid until" is a calendar date: expiry is judged on the org's day, the
  // same rule the accept route enforces (isEstimatePastValidUntil).
  const today = todayInZone(await getOrgTimeZone(service, ctx.orgId));

  return (
    <PortalEstimatesPage
      estimates={normalized.map((e) => ({
        ...e,
        accountName: accountNames.get(e.client_id) ?? null,
        deposit_due_cents: depositDue(e),
        deposit_pay_url: payUrlByEstimate.get(e.id) ?? null,
      }))}
      today={today}
    />
  );
}
