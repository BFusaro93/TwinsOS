import { NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { logger } from "@/lib/logger";
import {
  inChunks,
  isAuthorizedCron,
  loadEquiptOrgIds,
  loadOrgUsers,
  makeResend,
  prefEnabled,
  sendDigests,
  serviceClient,
  type DigestItem,
  type DigestSpec,
} from "@/lib/cron/equipt-alert-digest";

const log = logger.child("low-stock-notify cron");

/** Roles that manage stock and reordering. */
const RECIPIENT_ROLES = ["admin", "manager", "purchaser"];

const SPEC: DigestSpec = {
  alertType: "low_stock",
  prefKey: "emailLowStockAlert",
  defaultOn: true,
  subject: (n) => (n === 1 ? "Low stock alert: 1 item at or below its minimum" : `Low stock alert: ${n} items at or below their minimum`),
  heading: "Low Stock Alert",
  intro: (n) => `${n === 1 ? "This item has" : `These ${n} items have`} dropped to or below the minimum stock level.`,
  ctaLabel: "View Parts",
  ctaPath: "/cmms/parts",
};

interface StockRow {
  id: string;
  org_id: string;
  name: string;
  part_number: string | null;
  quantity_on_hand: number;
  minimum_stock: number;
}

/**
 * GET /api/cron/low-stock-notify — called daily by Vercel Cron.
 *
 * Emails admins, managers and purchasers (who haven't switched off "Low Stock
 * Alert" email) ONE digest of inventory parts and stocked materials whose
 * quantity on hand is at or below a minimum stock level above zero. An item is
 * announced once per user; its claim is dropped when it recovers above the
 * minimum, so it alerts again the next time it dips. The bell already shows
 * these in-app, so this cron sends email only.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = serviceClient();

  try {
    // PostgREST can't compare two columns, so quantity <= minimum is tested here.
    // maintenance_part products are mirrored into `parts`; only stocked
    // materials are read from product_items so nothing is listed twice.
    const parts = await fetchAllRows<StockRow>(() =>
      supabase
        .from("parts")
        .select("id, org_id, name, part_number, quantity_on_hand, minimum_stock")
        .is("deleted_at", null)
        .eq("is_inventory", true)
        .gt("minimum_stock", 0)
    );
    const products = await fetchAllRows<StockRow>(() =>
      supabase
        .from("product_items")
        .select("id, org_id, name, part_number, quantity_on_hand, minimum_stock")
        .is("deleted_at", null)
        .eq("is_inventory", true)
        .eq("category", "stocked_material")
        .gt("minimum_stock", 0)
    );

    const lowByOrg = new Map<string, DigestItem[]>();
    const lowIds = new Set<string>();
    const add = (row: StockRow, entityType: "part" | "product_item") => {
      if (Number(row.quantity_on_hand) > row.minimum_stock) return;
      lowIds.add(row.id);
      const list = lowByOrg.get(row.org_id) ?? [];
      list.push({
        entityType,
        entityId: row.id,
        eventKey: "",
        line: `${row.name}${row.part_number ? ` (${row.part_number})` : ""} — ${Number(row.quantity_on_hand)} on hand, minimum ${row.minimum_stock}`,
      });
      lowByOrg.set(row.org_id, list);
    };
    parts.forEach((p) => add(p, "part"));
    products.forEach((p) => add(p, "product_item"));

    // Recovered (or deleted / no longer tracked) items: forget the claim so a
    // future dip alerts again.
    const claims = await fetchAllRows<{ id: string; entity_id: string }>(() =>
      supabase.from("equipt_alert_email_claims").select("id, entity_id").eq("alert_type", "low_stock")
    );
    const recoveredClaimIds = claims.filter((c) => !lowIds.has(c.entity_id)).map((c) => c.id);
    await inChunks(recoveredClaimIds, 100, async (chunk) => {
      const { error } = await supabase.from("equipt_alert_email_claims").delete().in("id", chunk);
      if (error) log.error("could not clear recovered low-stock claims", { error });
      return [];
    });

    const orgIds = Array.from(lowByOrg.keys());
    if (orgIds.length === 0) return NextResponse.json({ emailed: 0 });
    const equiptOrgs = await loadEquiptOrgIds(supabase, orgIds);
    const resend = makeResend();
    let emailed = 0;

    for (const orgId of orgIds) {
      if (!equiptOrgs.has(orgId)) continue;
      try {
        const items = lowByOrg.get(orgId) ?? [];
        const users = await loadOrgUsers(supabase, orgId, RECIPIENT_ROLES);
        const recipients = users
          .filter((u) => !!u.email && prefEnabled(u.prefs, SPEC.prefKey, SPEC.defaultOn))
          .map((u) => ({ id: u.id, email: u.email!, name: u.name, items }));
        emailed += await sendDigests(supabase, resend, orgId, SPEC, recipients);
      } catch (err) {
        log.error("low-stock digest failed for org", { orgId, err });
      }
    }

    return NextResponse.json({ emailed });
  } catch (err) {
    log.error("low-stock cron failed", { err });
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
}
