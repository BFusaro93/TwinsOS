import type { SocialWeekStat } from "@/lib/hooks/use-social-media-stats";

/** Twins' tracked platforms, in display order. Colors are the chart series. */
export const SOCIAL_PLATFORMS = [
  { key: "Facebook", color: "#2563eb" },
  { key: "Instagram", color: "#db2777" },
  { key: "TikTok", color: "#0f172a" },
  { key: "YouTube", color: "#dc2626" },
  { key: "LinkedIn", color: "#0891b2" },
] as const;

export const PLATFORM_COLOR: Record<string, string> = Object.fromEntries(
  SOCIAL_PLATFORMS.map((p) => [p.key, p.color])
);

/** Monthly goals, carried over from the spreadsheet's "This Month vs. Goals". */
export const SOCIAL_GOALS = {
  postsPerWeekMin: 2, // all platforms combined, per week in the month
  postsPerWeekMax: 3,
  engagementRateMin: 0.03,
  engagementRateMax: 0.05,
  leadsMin: 3,
  leadsMax: 5,
  followerGrowthMin: 0.05,
  followerGrowthMax: 0.1,
};

// ── Dates (plain "YYYY-MM-DD" strings, UTC math so no timezone drift) ─────────

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function todayIso(): string {
  const now = new Date();
  return fmt(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}
export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}
/** The Monday on or before the given date. */
export function mondayOf(iso: string): string {
  const d = parse(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(iso, -dow);
}
export function monthStart(iso: string): string {
  return iso.slice(0, 8) + "01";
}
export function addMonths(iso: string, months: number): string {
  const d = parse(monthStart(iso));
  d.setUTCMonth(d.getUTCMonth() + months);
  return fmt(d);
}
/** Weeks (Mondays) whose week_start falls in the month — how the sheet bucketed. */
export function mondaysInMonth(iso: string): number {
  const start = monthStart(iso);
  const next = addMonths(start, 1);
  let n = 0;
  for (let d = start; d < next; d = addDays(d, 1)) if (parse(d).getUTCDay() === 1) n++;
  return n;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtShortDate(iso: string): string {
  const d = parse(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
export function fmtWeekRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const s = parse(weekStart);
  const e = parse(end);
  const tail = s.getUTCMonth() === e.getUTCMonth() ? `${e.getUTCDate()}` : fmtShortDate(end);
  return `${fmtShortDate(weekStart)} – ${tail}, ${e.getUTCFullYear()}`;
}
export function fmtMonth(iso: string): string {
  const d = parse(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ── Ranges ────────────────────────────────────────────────────────────────────

export type RangeKey = "4w" | "12w" | "this_month" | "last_month" | "ytd" | "all";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "4w", label: "Last 4 weeks" },
  { key: "12w", label: "Last 12 weeks" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "ytd", label: "Year to date" },
  { key: "all", label: "All time" },
];

/** [from, to) on week_start, plus the equal-length period before it for deltas. */
export function rangeBounds(key: RangeKey, today: string): { from: string; to: string; prevFrom: string | null } {
  const thisMonday = mondayOf(today);
  const nextMonday = addDays(thisMonday, 7);
  switch (key) {
    case "4w":
      return { from: addDays(nextMonday, -28), to: nextMonday, prevFrom: addDays(nextMonday, -56) };
    case "12w":
      return { from: addDays(nextMonday, -84), to: nextMonday, prevFrom: addDays(nextMonday, -168) };
    case "this_month":
      return { from: monthStart(today), to: addMonths(today, 1), prevFrom: addMonths(today, -1) };
    case "last_month":
      return { from: addMonths(today, -1), to: monthStart(today), prevFrom: addMonths(today, -2) };
    case "ytd":
      return { from: today.slice(0, 4) + "-01-01", to: addMonths(today, 1), prevFrom: null };
    case "all":
      return { from: "0000-01-01", to: "9999-12-31", prevFrom: null };
  }
}

// ── Per-row derived values ────────────────────────────────────────────────────

/** Likes + comments + shares + saves; null when nothing was entered. */
export function engagementsOf(s: Pick<SocialWeekStat, "likes" | "comments" | "shares" | "saves">): number | null {
  const parts = [s.likes, s.comments, s.shares, s.saves];
  if (parts.every((p) => p == null)) return null;
  return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0);
}

/**
 * Net new followers per row id. When a platform has a follower count this week
 * AND an earlier logged week, the change between the two counts wins (so fixing
 * an old count re-flows automatically); otherwise the stored net-new figure.
 */
export function resolveNetNew(stats: SocialWeekStat[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const byPlatform = new Map<string, SocialWeekStat[]>();
  for (const s of stats) {
    const list = byPlatform.get(s.platform) ?? [];
    list.push(s);
    byPlatform.set(s.platform, list);
  }
  for (const list of byPlatform.values()) {
    list.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    let prevFollowers: number | null = null;
    for (const s of list) {
      if (s.followers != null && prevFollowers != null) out.set(s.id, s.followers - prevFollowers);
      else out.set(s.id, s.netNewFollowers);
      if (s.followers != null) prevFollowers = s.followers;
    }
  }
  return out;
}

/** Latest follower count logged for a platform before a given week (exclusive). */
export function followersBefore(stats: SocialWeekStat[], platform: string, weekStart: string): number | null {
  let best: SocialWeekStat | null = null;
  for (const s of stats) {
    if (s.platform !== platform || s.followers == null || s.weekStart >= weekStart) continue;
    if (!best || s.weekStart > best.weekStart) best = s;
  }
  return best?.followers ?? null;
}

// ── Aggregates ────────────────────────────────────────────────────────────────

export interface SocialTotals {
  posts: number;
  views: number;
  engagements: number;
  engagementRate: number | null;
  netNewFollowers: number;
  leads: number;
  weeks: number;
}

export function totalsOf(rows: SocialWeekStat[], netNew: Map<string, number | null>): SocialTotals {
  let posts = 0, views = 0, engagements = 0, netNewFollowers = 0, leads = 0;
  // Engagement rate only counts rows that have both views and engagements, so
  // a week with views but no likes typed yet doesn't drag the rate down.
  let rateViews = 0, rateEng = 0;
  const weeks = new Set<string>();
  for (const r of rows) {
    weeks.add(r.weekStart);
    posts += r.posts ?? 0;
    views += r.views ?? 0;
    const e = engagementsOf(r);
    engagements += e ?? 0;
    if (e != null && r.views) {
      rateViews += r.views;
      rateEng += e;
    }
    netNewFollowers += netNew.get(r.id) ?? 0;
    leads += r.leads ?? 0;
  }
  return {
    posts,
    views,
    engagements,
    engagementRate: rateViews > 0 ? rateEng / rateViews : null,
    netNewFollowers,
    leads,
    weeks: weeks.size,
  };
}

export function inRange(rows: SocialWeekStat[], from: string, to: string): SocialWeekStat[] {
  return rows.filter((r) => r.weekStart >= from && r.weekStart < to);
}

export interface FollowerSnapshotRow {
  platform: string;
  current: number | null;
  startOfMonth: number | null;
  growth: number | null;
  growthRate: number | null;
}

/**
 * The spreadsheet's "Follower Snapshot", per platform. Current = the most
 * recent follower count logged for THAT platform; start of month = its latest
 * count from a week starting before the 1st. When either count is missing,
 * growth falls back to the month's summed net-new followers.
 */
export function followerSnapshot(
  stats: SocialWeekStat[],
  netNew: Map<string, number | null>,
  platforms: string[],
  today: string
): FollowerSnapshotRow[] {
  const mStart = monthStart(today);
  const mEnd = addMonths(today, 1);
  return platforms.map((platform) => {
    const rows = stats.filter((s) => s.platform === platform);
    const withCount = rows.filter((s) => s.followers != null).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    const current = withCount[0]?.followers ?? null;
    const startOfMonth = followersBefore(stats, platform, mStart);
    let growth: number | null = null;
    if (current != null && startOfMonth != null) growth = current - startOfMonth;
    else {
      const monthRows = rows.filter((s) => s.weekStart >= mStart && s.weekStart < mEnd);
      const vals = monthRows.map((s) => netNew.get(s.id)).filter((v): v is number => v != null);
      growth = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    }
    const base = startOfMonth ?? (current != null && growth != null ? current - growth : null);
    return {
      platform,
      current,
      startOfMonth,
      growth,
      growthRate: growth != null && base ? growth / base : null,
    };
  });
}

/** Distinct platforms present in the data, known ones first in display order. */
export function platformsIn(stats: SocialWeekStat[]): string[] {
  const known = SOCIAL_PLATFORMS.map((p) => p.key as string);
  const extra = Array.from(new Set(stats.map((s) => s.platform))).filter((p) => !known.includes(p)).sort();
  return [...known, ...extra];
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}
export function fmtCompact(n: number): string {
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}
export function fmtSigned(n: number | null | undefined): string {
  if (n == null) return "—";
  return n > 0 ? `+${n.toLocaleString("en-US")}` : n.toLocaleString("en-US");
}
