import { NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone, shiftYmd, isoInZone } from "@/lib/time/zone";
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

const log = logger.child("pm-due-notify cron");

/** Matches the Settings copy ("due within 7 days") and the bell's PM window. */
const DUE_WINDOW_DAYS = 7;

/** Roles that plan and perform preventive maintenance. */
const RECIPIENT_ROLES = ["admin", "manager", "technician"];

const SPEC: DigestSpec = {
  alertType: "pm_due",
  prefKey: "emailPmScheduleDue",
  // Off by default in Settings: only people who opted in get this.
  defaultOn: false,
  subject: (n) => (n === 1 ? "PM schedule due: 1 schedule needs attention" : `PM schedules due: ${n} schedules need attention`),
  heading: "PM Schedules Due",
  intro: (n) => `${n === 1 ? "This preventive maintenance schedule is" : `These ${n} preventive maintenance schedules are`} due within ${DUE_WINDOW_DAYS} days or already overdue, and no open work order exists for ${n === 1 ? "it" : "them"} yet.`,
  ctaLabel: "View PM Schedules",
  ctaPath: "/cmms/pm-schedules",
};

const OPEN_WO_STATUSES = ["open", "in_progress", "on_hold"];

/**
 * GET /api/cron/pm-due-notify — called daily by Vercel Cron.
 *
 * Emails admins, managers and technicians who turned on "PM Schedule Due" ONE
 * digest of active, un-paused PM schedules due within 7 days (or overdue) that
 * have no open work order yet. Each due date is announced once per user (a
 * completed PM rolls the date forward, which is a new event). The bell already
 * shows these in-app, so this cron sends email only.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = serviceClient();

  try {
    // next_due_date is a calendar date, so the real window is each org's own.
    // This cron spans every org: widen the SQL bound a day, re-filter per org.
    const upper = shiftYmd(isoInZone(new Date(), "UTC"), DUE_WINDOW_DAYS + 1);
    const schedules = await fetchAllRows<{ id: string; org_id: string; title: string; asset_name: string | null; next_due_date: string }>(() =>
      supabase
        .from("pm_schedules")
        .select("id, org_id, title, asset_name, next_due_date")
        .eq("is_active", true)
        .is("deleted_at", null)
        .lte("next_due_date", upper)
    );
    if (schedules.length === 0) return NextResponse.json({ emailed: 0 });

    // Paused schedules (off-season) owe nothing. paused_today is computed on the org's day.
    const paused = await fetchAllRows<{ pm_schedule_id: string }>(() =>
      supabase.from("v_pm_schedule_pause_state").select("pm_schedule_id").eq("paused_today", true)
    );
    const pausedIds = new Set(paused.map((p) => p.pm_schedule_id));

    // A schedule that already has an open work order is being handled.
    const scheduleIds = schedules.map((s) => s.id).filter((id) => !pausedIds.has(id));
    const withOpenWo = new Set(
      (
        await inChunks(scheduleIds, 100, async (chunk) => {
          const { data, error } = await supabase
            .from("work_orders")
            .select("pm_schedule_id")
            .in("pm_schedule_id", chunk)
            .in("status", OPEN_WO_STATUSES)
            .is("deleted_at", null);
          if (error) throw error;
          return (data ?? []) as { pm_schedule_id: string }[];
        })
      ).map((w) => w.pm_schedule_id)
    );

    const byOrg = new Map<string, typeof schedules>();
    for (const s of schedules) {
      if (pausedIds.has(s.id) || withOpenWo.has(s.id)) continue;
      const list = byOrg.get(s.org_id) ?? [];
      list.push(s);
      byOrg.set(s.org_id, list);
    }
    const orgIds = Array.from(byOrg.keys());
    if (orgIds.length === 0) return NextResponse.json({ emailed: 0 });

    const equiptOrgs = await loadEquiptOrgIds(supabase, orgIds);
    const resend = makeResend();
    let emailed = 0;

    for (const orgId of orgIds) {
      if (!equiptOrgs.has(orgId)) continue;
      try {
        const orgToday = todayInZone(await getOrgTimeZone(supabase, orgId));
        const windowEnd = shiftYmd(orgToday, DUE_WINDOW_DAYS);
        const items: DigestItem[] = (byOrg.get(orgId) ?? [])
          .filter((s) => s.next_due_date <= windowEnd)
          .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
          .map((s) => ({
            entityType: "pm_schedule" as const,
            entityId: s.id,
            eventKey: s.next_due_date,
            line: `${s.title}${s.asset_name ? ` — ${s.asset_name}` : ""} (${s.next_due_date < orgToday ? "overdue, was due" : "due"} ${s.next_due_date})`,
          }));
        if (items.length === 0) continue;

        const users = await loadOrgUsers(supabase, orgId, RECIPIENT_ROLES);
        const recipients = users
          .filter((u) => !!u.email && prefEnabled(u.prefs, SPEC.prefKey, SPEC.defaultOn))
          .map((u) => ({ id: u.id, email: u.email!, name: u.name, items }));
        emailed += await sendDigests(supabase, resend, orgId, SPEC, recipients);
      } catch (err) {
        log.error("pm-due digest failed for org", { orgId, err });
      }
    }

    return NextResponse.json({ emailed });
  } catch (err) {
    log.error("pm-due cron failed", { err });
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
}
