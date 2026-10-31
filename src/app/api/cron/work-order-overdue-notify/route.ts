import { NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone, shiftYmd, isoInZone } from "@/lib/time/zone";
import { logger } from "@/lib/logger";
import {
  isAuthorizedCron,
  loadEquiptOrgIds,
  loadOrgUsers,
  makeResend,
  prefEnabled,
  sendDigests,
  serviceClient,
  type DigestItem,
  type DigestRecipient,
  type DigestSpec,
} from "@/lib/cron/equipt-alert-digest";

const log = logger.child("work-order-overdue-notify cron");

/** Admins and managers hear about every overdue work order; assignees about their own. */
const OVERSEER_ROLES = ["admin", "manager"];
const ASSIGNEE_ROLES = ["admin", "manager", "technician", "purchaser", "viewer", "requestor"];

const OPEN_STATUSES = ["open", "in_progress"];

const SPEC: DigestSpec = {
  alertType: "work_order_overdue",
  prefKey: "emailWorkOrderOverdue",
  defaultOn: true,
  subject: (n) => (n === 1 ? "Work order overdue: 1 work order is past its due date" : `Work orders overdue: ${n} work orders are past their due date`),
  heading: "Overdue Work Orders",
  intro: (n) => `${n === 1 ? "This work order has" : `These ${n} work orders have`} passed ${n === 1 ? "its" : "their"} due date.`,
  ctaLabel: "View Work Orders",
  ctaPath: "/cmms/work-orders",
};

interface OverdueWo {
  id: string;
  org_id: string;
  work_order_number: string;
  title: string;
  asset_name: string | null;
  due_date: string;
  assigned_to_id: string | null;
  assigned_to_ids: unknown;
}

function assigneeIds(wo: OverdueWo): string[] {
  const ids = new Set<string>();
  if (wo.assigned_to_id) ids.add(wo.assigned_to_id);
  if (Array.isArray(wo.assigned_to_ids)) for (const v of wo.assigned_to_ids) if (typeof v === "string") ids.add(v);
  return Array.from(ids);
}

/**
 * GET /api/cron/work-order-overdue-notify — called daily by Vercel Cron.
 *
 * Emails ONE digest of open / in-progress work orders past their due date (on
 * the org's own calendar day) to each work order's assignees, and to the org's
 * admins and managers for all of them — unless they switched off "Work Order
 * Overdue" email. A work order is announced once per user per due date
 * (re-dating it re-alerts). The bell already shows these in-app, so this cron
 * sends email only.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = serviceClient();

  try {
    // due_date is a calendar date, so "overdue" is each org's own day. This
    // cron spans every org: widen the SQL bound a day, re-filter per org.
    const upper = shiftYmd(isoInZone(new Date(), "UTC"), 1);
    const workOrders = await fetchAllRows<OverdueWo>(() =>
      supabase
        .from("work_orders")
        .select("id, org_id, work_order_number, title, asset_name, due_date, assigned_to_id, assigned_to_ids")
        .in("status", OPEN_STATUSES)
        .is("deleted_at", null)
        .lt("due_date", upper)
    );
    if (workOrders.length === 0) return NextResponse.json({ emailed: 0 });

    const byOrg = new Map<string, OverdueWo[]>();
    for (const wo of workOrders) {
      const list = byOrg.get(wo.org_id) ?? [];
      list.push(wo);
      byOrg.set(wo.org_id, list);
    }
    const orgIds = Array.from(byOrg.keys());
    const equiptOrgs = await loadEquiptOrgIds(supabase, orgIds);
    const resend = makeResend();
    let emailed = 0;

    for (const orgId of orgIds) {
      if (!equiptOrgs.has(orgId)) continue;
      try {
        const orgToday = todayInZone(await getOrgTimeZone(supabase, orgId));
        const overdue = (byOrg.get(orgId) ?? [])
          .filter((wo) => wo.due_date < orgToday)
          .sort((a, b) => a.due_date.localeCompare(b.due_date));
        if (overdue.length === 0) continue;

        const toItem = (wo: OverdueWo): DigestItem => ({
          entityType: "work_order",
          entityId: wo.id,
          eventKey: wo.due_date,
          line: `${wo.work_order_number} — ${wo.title}${wo.asset_name ? ` (${wo.asset_name})` : ""}, due ${wo.due_date}`,
        });

        // work_orders.assigned_to_id(s) are crm_employees ids, not login ids: map them to the
        // employee's login so an assignee actually matches a recipient below.
        const employeeIds = Array.from(new Set(overdue.flatMap((wo) => assigneeIds(wo))));
        const loginByEmployee = new Map<string, string>();
        if (employeeIds.length > 0) {
          const { data: emps } = await supabase
            .from("crm_employees")
            .select("id, user_id")
            .eq("org_id", orgId)
            .in("id", employeeIds);
          for (const e of (emps ?? []) as { id: string; user_id: string | null }[]) {
            if (e.user_id) loginByEmployee.set(e.id, e.user_id);
          }
        }

        // Active users only; deactivated or merely invited logins never appear.
        const users = await loadOrgUsers(supabase, orgId, Array.from(new Set([...OVERSEER_ROLES, ...ASSIGNEE_ROLES])));
        const recipients: DigestRecipient[] = [];
        for (const u of users) {
          if (!u.email || !prefEnabled(u.prefs, SPEC.prefKey, SPEC.defaultOn)) continue;
          const mine = OVERSEER_ROLES.includes(u.role)
            ? overdue
            : overdue.filter((wo) => assigneeIds(wo).some((eid) => loginByEmployee.get(eid) === u.id));
          if (mine.length === 0) continue;
          recipients.push({ id: u.id, email: u.email, name: u.name, items: mine.map(toItem) });
        }
        emailed += await sendDigests(supabase, resend, orgId, SPEC, recipients);
      } catch (err) {
        log.error("work-order-overdue digest failed for org", { orgId, err });
      }
    }

    return NextResponse.json({ emailed });
  } catch (err) {
    log.error("work-order-overdue cron failed", { err });
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
}
