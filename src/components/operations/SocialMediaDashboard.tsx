"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Share2, ChevronDown, Target } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
} from "recharts";
import { PageHeader } from "@/components/shared/PageHeader";
import { useConfirm } from "@/components/shared/useConfirm";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentUserStore } from "@/stores";
import {
  useSocialMediaStats,
  useSaveSocialWeek,
  useDeleteSocialWeek,
  useSocialMediaGoals,
  useSaveSocialMediaGoals,
  type SocialWeekStat,
  type SocialWeekStatInput,
} from "@/lib/hooks/use-social-media-stats";
import {
  PLATFORM_COLOR,
  RANGE_OPTIONS,
  DEFAULT_SOCIAL_GOALS,
  addDays,
  addMonths,
  engagementsOf,
  fmtCompact,
  fmtMonth,
  fmtNum,
  fmtPct,
  fmtShortDate,
  fmtSigned,
  fmtWeekRange,
  followerSnapshot,
  followersBefore,
  inRange,
  mondayOf,
  mondaysInMonth,
  monthStart,
  platformsIn,
  rangeBounds,
  resolveNetNew,
  todayIso,
  totalsOf,
  type RangeKey,
  type SocialGoals,
  type SocialTotals,
} from "@/lib/utils/social-media-metrics";

type Tab = "overview" | "platforms" | "log" | "entry";

// Stable empty default — a fresh [] per render would re-fire the entry-grid effect forever.
const NO_STATS: SocialWeekStat[] = [];

// ── Small shared pieces (same look as the Driver Safety dashboard) ───────────

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
function Td({ children, right, cls }: { children: React.ReactNode; right?: boolean; cls?: string }) {
  return <td className={`whitespace-nowrap px-4 py-3 text-sm ${right ? "text-right tabular-nums" : ""} ${cls ?? ""}`}>{children}</td>;
}
function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}
function PlatformDot({ platform }: { platform: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PLATFORM_COLOR[platform] ?? "#94a3b8" }} />;
}

function Delta({ cur, prev, pct }: { cur: number | null; prev: number | null; pct?: boolean }) {
  if (cur == null || prev == null) return null;
  const diff = cur - prev;
  if (pct) {
    const pts = diff * 100;
    if (Math.abs(pts) < 0.05) return <span className="text-slate-400">no change</span>;
    return <span className={pts > 0 ? "text-green-600" : "text-red-600"}>{pts > 0 ? "▲" : "▼"} {Math.abs(pts).toFixed(1)} pts</span>;
  }
  if (prev === 0) return diff === 0 ? <span className="text-slate-400">no change</span> : null;
  const rel = diff / prev;
  if (Math.abs(rel) < 0.005) return <span className="text-slate-400">no change</span>;
  return <span className={rel > 0 ? "text-green-600" : "text-red-600"}>{rel > 0 ? "▲" : "▼"} {Math.abs(rel * 100).toFixed(0)}%</span>;
}

function KpiCard({ label, value, delta, sub }: { label: string; value: string; delta?: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">
        {delta ?? sub ?? " "}
      </p>
    </div>
  );
}

function GoalRow({ label, actual, display, min, max, target }: { label: string; actual: number | null; display: string; min: number; max: number; target: string }) {
  const onTrack = actual != null && actual >= min;
  // max can be 0 if an org sets every goal to 0 — avoid NaN widths.
  const pct = actual == null || max <= 0 ? 0 : Math.max(0, Math.min(1, actual / max));
  const markerPct = max > 0 ? (min / max) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="tabular-nums font-semibold text-slate-900">{display}</span>
      </div>
      <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${onTrack ? "bg-brand-500" : "bg-amber-400"}`} style={{ width: `${pct * 100}%` }} />
        <div className="absolute inset-y-0 w-px bg-slate-400" style={{ left: `${markerPct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-xs">
        <span className="text-slate-400">Target {target}</span>
        <span className={onTrack ? "font-medium text-green-600" : "font-medium text-amber-600"}>{onTrack ? "On track" : "Behind"}</span>
      </div>
    </div>
  );
}

const AXIS_TICK = { fontSize: 11, fill: "#94a3b8" };

// ── Entry form state ──────────────────────────────────────────────────────────

// The spreadsheet this replaced was filled in inconsistently (dates typed into
// the follower column, etc.), so every field carries a plain-English hint.
const ENTRY_FIELDS = [
  { key: "posts", label: "Posts published", hint: "How many posts/videos went out this week" },
  { key: "views", label: "Views / reach", hint: "Total views or accounts reached, Mon–Sun" },
  { key: "likes", label: "Likes", hint: "Likes/reactions received this week" },
  { key: "comments", label: "Comments", hint: "Comments received this week" },
  { key: "shares", label: "Shares", hint: "Shares/reposts this week" },
  { key: "saves", label: "Saves", hint: "Saves/bookmarks (0 if the platform has none)" },
  { key: "followers", label: "Total followers", hint: "The follower number on your profile right now — not a date, not the change" },
  { key: "netNewFollowers", label: "Net new followers", hint: "Leave blank — calculated from last week's total" },
  { key: "leads", label: "Leads generated", hint: "Inquiries that came from this platform (DMs, calls, forms)" },
] as const;
type EntryField = (typeof ENTRY_FIELDS)[number]["key"];
type EntryCell = Record<EntryField, string> & { notes: string; id?: string };

function emptyCell(): EntryCell {
  return { posts: "", views: "", likes: "", comments: "", shares: "", saves: "", followers: "", netNewFollowers: "", leads: "", notes: "" };
}
function cellFrom(s: SocialWeekStat): EntryCell {
  const str = (n: number | null) => (n == null ? "" : String(n));
  return {
    id: s.id,
    posts: str(s.posts), views: str(s.views), likes: str(s.likes), comments: str(s.comments),
    shares: str(s.shares), saves: str(s.saves), followers: str(s.followers),
    netNewFollowers: str(s.netNewFollowers), leads: str(s.leads), notes: s.notes ?? "",
  };
}
function toInt(v: string): number | null {
  const t = v.replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Math.round(Number(t));
  return Number.isFinite(n) ? n : null;
}

// ── Goals dialog ──────────────────────────────────────────────────────────────

const GOAL_FIELDS: {
  label: string;
  unit: string;
  min: keyof SocialGoals;
  max: keyof SocialGoals;
  percent?: boolean;
}[] = [
  { label: "Content published", unit: "posts per week, all platforms", min: "postsPerWeekMin", max: "postsPerWeekMax" },
  { label: "Engagement rate", unit: "% of views", min: "engagementRateMin", max: "engagementRateMax", percent: true },
  { label: "Leads generated", unit: "leads per month", min: "leadsMin", max: "leadsMax" },
  { label: "Follower growth", unit: "% per month", min: "followerGrowthMin", max: "followerGrowthMax", percent: true },
];

/** Stored rates are fractions; the form edits them as percents. */
function toFormValue(v: number, percent?: boolean): string {
  return String(percent ? +(v * 100).toFixed(4) : v);
}

function formFrom(g: SocialGoals): Record<keyof SocialGoals, string> {
  const out = {} as Record<keyof SocialGoals, string>;
  for (const f of GOAL_FIELDS) {
    out[f.min] = toFormValue(g[f.min], f.percent);
    out[f.max] = toFormValue(g[f.max], f.percent);
  }
  return out;
}

function GoalsDialog({
  open,
  onOpenChange,
  goals,
  isDefault,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: SocialGoals;
  isDefault: boolean;
  saving: boolean;
  onSave: (goals: SocialGoals) => Promise<void>;
}) {
  const [form, setForm] = useState<Record<keyof SocialGoals, string>>(() => formFrom(goals));
  const [error, setError] = useState<string | null>(null);

  // Reset to the saved values each time the dialog opens.
  useEffect(() => {
    if (open) {
      setForm(formFrom(goals));
      setError(null);
    }
  }, [open, goals]);

  async function handleSave() {
    const next = {} as SocialGoals;
    for (const f of GOAL_FIELDS) {
      const lo = Number(form[f.min].trim());
      const hi = Number(form[f.max].trim());
      if (form[f.min].trim() === "" || form[f.max].trim() === "" || !Number.isFinite(lo) || !Number.isFinite(hi)) {
        setError(`${f.label}: enter a number for both the minimum and the stretch goal.`);
        return;
      }
      if (lo < 0 || hi < 0) { setError(`${f.label}: goals can't be negative.`); return; }
      if (hi < lo) { setError(`${f.label}: the stretch goal must be at least the minimum.`); return; }
      next[f.min] = f.percent ? lo / 100 : lo;
      next[f.max] = f.percent ? hi / 100 : hi;
    }
    try {
      await onSave(next);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save goals.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit monthly goals</DialogTitle>
          <DialogDescription>
            A goal shows &ldquo;On track&rdquo; once it reaches the minimum; the bar fills up to the stretch goal.
            {isDefault && " These are the default goals — saving makes them your own."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_88px_88px] items-end gap-x-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <span />
            <span>Minimum</span>
            <span>Stretch</span>
          </div>
          {GOAL_FIELDS.map((f) => (
            <div key={f.min} className="grid grid-cols-[1fr_88px_88px] items-center gap-x-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{f.label}</p>
                <p className="text-xs text-slate-400">{f.unit}</p>
              </div>
              {[f.min, f.max].map((k) => (
                <div key={k} className="relative">
                  <input
                    inputMode="decimal"
                    value={form[k]}
                    onChange={(e) => { setForm((cur) => ({ ...cur, [k]: e.target.value })); setError(null); }}
                    className={`w-full rounded-md border border-slate-200 py-1.5 text-right text-sm tabular-nums focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 ${f.percent ? "pl-2 pr-6" : "px-2"}`}
                    aria-label={`${f.label} ${k === f.min ? "minimum" : "stretch goal"}`}
                  />
                  {f.percent && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>}
                </div>
              ))}
            </div>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            onClick={() => setForm(formFrom(DEFAULT_SOCIAL_GOALS))}
            className="mr-auto text-sm text-slate-500 hover:text-slate-700"
          >
            Reset to defaults
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save goals"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SocialMediaDashboard() {
  const [confirm, confirmDialog] = useConfirm();
  const { currentUser } = useCurrentUserStore();
  const canEdit = currentUser.role === "admin" || currentUser.role === "manager";

  const { data, isLoading } = useSocialMediaStats();
  const stats = data ?? NO_STATS;
  const saveWeek = useSaveSocialWeek();
  const deleteWeek = useDeleteSocialWeek();
  const { data: goalsRecord } = useSocialMediaGoals();
  const saveGoals = useSaveSocialMediaGoals();
  const goals = goalsRecord?.goals ?? DEFAULT_SOCIAL_GOALS;
  const [goalsOpen, setGoalsOpen] = useState(false);

  const today = todayIso();
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<RangeKey>("12w");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);

  const platforms = useMemo(() => platformsIn(stats), [stats]);
  const activePlatforms = platforms.filter((p) => !hidden.has(p));
  const netNew = useMemo(() => resolveNetNew(stats), [stats]);
  const filtered = useMemo(() => stats.filter((s) => !hidden.has(s.platform)), [stats, hidden]);

  const bounds = rangeBounds(range, today);
  const current = totalsOf(inRange(filtered, bounds.from, bounds.to), netNew);
  const previous: SocialTotals | null = bounds.prevFrom ? totalsOf(inRange(filtered, bounds.prevFrom, bounds.from), netNew) : null;

  // ── Entry state ────────────────────────────────────────────────────────────
  const latestWeek = stats.length ? stats[stats.length - 1].weekStart : null;
  const [entryWeek, setEntryWeek] = useState<string>(mondayOf(today));
  const [cells, setCells] = useState<Record<string, EntryCell>>({});
  const [entryError, setEntryError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // (Re)load the grid whenever the week changes or fresh data arrives.
  useEffect(() => {
    const next: Record<string, EntryCell> = {};
    for (const p of platforms) {
      const existing = stats.find((s) => s.weekStart === entryWeek && s.platform === p);
      next[p] = existing ? cellFrom(existing) : emptyCell();
    }
    setCells(next);
    setEntryError(null);
  }, [entryWeek, stats, platforms]);

  function openEntry(week: string) {
    setEntryWeek(week);
    setSavedAt(null);
    setTab("entry");
  }

  function setCell(platform: string, field: EntryField | "notes", value: string) {
    setCells((c) => ({ ...c, [platform]: { ...(c[platform] ?? emptyCell()), [field]: value } }));
    setSavedAt(null);
  }

  async function handleSave() {
    setEntryError(null);
    const rows: SocialWeekStatInput[] = [];
    for (const p of platforms) {
      const c = cells[p];
      if (!c) continue;
      const hasValue = ENTRY_FIELDS.some((f) => c[f.key].trim() !== "") || c.notes.trim() !== "";
      if (!hasValue && !c.id) continue;
      for (const f of ENTRY_FIELDS) {
        const n = toInt(c[f.key]);
        if (c[f.key].trim() !== "" && n == null) { setEntryError(`${p}: "${c[f.key]}" isn't a number (${f.label}).`); return; }
        if (n != null && n < 0 && f.key !== "netNewFollowers") { setEntryError(`${p}: ${f.label} can't be negative.`); return; }
      }
      const followers = toInt(c.followers);
      const prev = followersBefore(stats, p, entryWeek);
      // Blank net-new + both counts known → store the difference.
      const netNewVal = toInt(c.netNewFollowers) ?? (followers != null && prev != null ? followers - prev : null);
      rows.push({
        id: c.id,
        weekStart: entryWeek,
        platform: p,
        posts: toInt(c.posts), views: toInt(c.views), likes: toInt(c.likes), comments: toInt(c.comments),
        shares: toInt(c.shares), saves: toInt(c.saves), followers, netNewFollowers: netNewVal,
        leads: toInt(c.leads), notes: c.notes.trim() || null,
      });
    }
    if (rows.length === 0) { setEntryError("Enter at least one number before saving."); return; }
    try {
      await saveWeek.mutateAsync(rows);
      setSavedAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    } catch (e) {
      setEntryError(e instanceof Error ? e.message : "Couldn't save this week.");
    }
  }

  async function handleDeleteWeek(week: string) {
    const ids = stats.filter((s) => s.weekStart === week).map((s) => s.id);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `Delete the week of ${fmtWeekRange(week)}?`,
      description: `Removes all ${ids.length} platform ${ids.length === 1 ? "entry" : "entries"} logged for that week.`,
      confirmLabel: "Delete week",
      destructive: true,
    });
    if (ok) deleteWeek.mutate(ids);
  }

  // ── Derived series ─────────────────────────────────────────────────────────
  const rangeRows = inRange(filtered, bounds.from, bounds.to);
  const weeksInRange = Array.from(new Set(rangeRows.map((r) => r.weekStart))).sort();

  const weeklySeries = weeksInRange.map((w) => {
    const row: Record<string, string | number | null> = { week: fmtShortDate(w) };
    let v = 0, e = 0;
    for (const p of activePlatforms) {
      const s = rangeRows.find((r) => r.weekStart === w && r.platform === p);
      row[p] = s?.views ?? null;
      const eng = s ? engagementsOf(s) : null;
      row[`${p}_er`] = s && s.views && eng != null ? +((eng / s.views) * 100).toFixed(2) : null;
      row[`${p}_followers`] = s?.followers ?? null;
      row[`${p}_net`] = s ? netNew.get(s.id) ?? null : null;
      if (s && s.views && eng != null) { v += s.views; e += eng; }
    }
    row.overall_er = v > 0 ? +((e / v) * 100).toFixed(2) : null;
    return row;
  });
  const hasFollowerCounts = rangeRows.some((r) => r.followers != null);

  // This-month goals use every platform (like the sheet), not the chip filter.
  const monthRows = inRange(stats, monthStart(today), addMonths(today, 1));
  const monthTotals = totalsOf(monthRows, netNew);
  const snapshot = followerSnapshot(stats, netNew, platforms, today);
  const snapCurrent = snapshot.reduce((a, r) => a + (r.current ?? 0), 0);
  const snapStart = snapshot.reduce((a, r) => a + (r.startOfMonth ?? 0), 0);
  const snapGrowth = snapshot.reduce((a, r) => a + (r.growth ?? 0), 0);
  const snapBase = snapStart || (snapCurrent ? snapCurrent - snapGrowth : 0);
  const followerGrowthRate = snapBase > 0 ? snapGrowth / snapBase : null;
  const weeksThisMonth = mondaysInMonth(today);

  // Per-platform comparison over the selected range.
  const platformRows = activePlatforms.map((p) => {
    const rows = rangeRows.filter((r) => r.platform === p);
    const t = totalsOf(rows, netNew);
    return { platform: p, ...t, viewsPerPost: t.posts ? t.views / t.posts : null };
  }).filter((r) => r.weeks > 0);
  const bestEr = platformRows.reduce<number | null>((m, r) => (r.engagementRate != null && (m == null || r.engagementRate > m) ? r.engagementRate : m), null);

  // Monthly summary (month × platform), newest month first.
  const months = Array.from(new Set(filtered.map((s) => monthStart(s.weekStart)))).sort().reverse();

  // Weekly log groups, newest first.
  const allWeeks = Array.from(new Set(stats.map((s) => s.weekStart))).sort().reverse();

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "platforms", label: "Platforms & Monthly" },
    { key: "log", label: "Weekly Log" },
    ...(canEdit ? [{ key: "entry" as Tab, label: "Log a Week" }] : []),
  ];

  const filterBar = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-1.5">
        {platforms.map((p) => {
          const on = !hidden.has(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(p)) n.delete(p); else n.add(p); return n; })}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? "border-slate-300 bg-white text-slate-700" : "border-dashed border-slate-200 bg-slate-50 text-slate-400"}`}
              aria-pressed={on}
            >
              <span className={on ? "" : "opacity-30"}><PlatformDot platform={p} /></span>
              {p}
            </button>
          );
        })}
      </div>
      <select
        value={range}
        onChange={(e) => setRange(e.target.value as RangeKey)}
        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
        aria-label="Date range"
      >
        {RANGE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </div>
  );

  function Empty() {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed bg-white py-16 text-center">
        <Share2 className="mb-3 h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">No weeks logged yet</p>
        <p className="mt-1 text-xs text-slate-400">Log your first week of numbers to start the dashboard.</p>
        {canEdit && (
          <button onClick={() => openEntry(mondayOf(today))} className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            Log a Week
          </button>
        )}
      </div>
    );
  }

  function Overview() {
    if (stats.length === 0) return <Empty />;
    return (
      <div className="flex flex-col gap-5">
        {filterBar}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Posts" value={fmtNum(current.posts)} delta={previous && <Delta cur={current.posts} prev={previous.posts} />} />
          <KpiCard label="Views / Reach" value={fmtNum(current.views)} delta={previous && <Delta cur={current.views} prev={previous.views} />} />
          <KpiCard label="Engagements" value={fmtNum(current.engagements)} delta={previous && <Delta cur={current.engagements} prev={previous.engagements} />} />
          <KpiCard label="Engagement Rate" value={fmtPct(current.engagementRate, 2)} delta={previous && <Delta cur={current.engagementRate} prev={previous.engagementRate} pct />} />
          <KpiCard label="Net New Followers" value={fmtSigned(current.netNewFollowers)} delta={previous && <Delta cur={current.netNewFollowers} prev={previous.netNewFollowers} />} />
          <KpiCard label="Leads" value={fmtNum(current.leads)} delta={previous && <Delta cur={current.leads} prev={previous.leads} />} />
        </div>
        {previous && <p className="-mt-3 text-xs text-slate-400">Change vs. the previous {RANGE_OPTIONS.find((o) => o.key === range)?.label.toLowerCase().replace("last ", "")} · {current.weeks} {current.weeks === 1 ? "week" : "weeks"} logged in range</p>}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Card
              title={`This Month vs. Goals — ${fmtMonth(monthStart(today))}`}
              action={
                canEdit ? (
                  <button onClick={() => setGoalsOpen(true)} className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
                    <Target className="h-3.5 w-3.5" /> Edit goals
                  </button>
                ) : undefined
              }
            >
              <div className="flex flex-col gap-5">
                <GoalRow
                  label="Content published"
                  actual={monthTotals.posts}
                  display={fmtNum(monthTotals.posts)}
                  min={goals.postsPerWeekMin * weeksThisMonth}
                  max={Math.max(goals.postsPerWeekMax * weeksThisMonth, monthTotals.posts)}
                  target={`${fmtNum(goals.postsPerWeekMin * weeksThisMonth)}–${fmtNum(goals.postsPerWeekMax * weeksThisMonth)} (${fmtNum(goals.postsPerWeekMin)}–${fmtNum(goals.postsPerWeekMax)}/wk × ${weeksThisMonth})`}
                />
                <GoalRow
                  label="Engagement rate"
                  actual={monthTotals.engagementRate}
                  display={fmtPct(monthTotals.engagementRate, 2)}
                  min={goals.engagementRateMin}
                  max={Math.max(goals.engagementRateMax, monthTotals.engagementRate ?? 0)}
                  target={`${fmtPct(goals.engagementRateMin)}–${fmtPct(goals.engagementRateMax)}`}
                />
                <GoalRow
                  label="Leads generated"
                  actual={monthTotals.leads}
                  display={fmtNum(monthTotals.leads)}
                  min={goals.leadsMin}
                  max={Math.max(goals.leadsMax, monthTotals.leads)}
                  target={`${fmtNum(goals.leadsMin)}–${fmtNum(goals.leadsMax)}`}
                />
                <GoalRow
                  label="Follower growth"
                  actual={followerGrowthRate}
                  display={fmtPct(followerGrowthRate)}
                  min={goals.followerGrowthMin}
                  max={Math.max(goals.followerGrowthMax, followerGrowthRate ?? 0)}
                  target={`${fmtPct(goals.followerGrowthMin)}–${fmtPct(goals.followerGrowthMax)}`}
                />
              </div>
            </Card>
          </div>
          <div className="lg:col-span-3">
            <Card title="Follower Snapshot">
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr><Th>Platform</Th><Th right>Current</Th><Th right>Start of Month</Th><Th right>Growth</Th><Th right>Rate</Th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {snapshot.map((r) => (
                      <tr key={r.platform}>
                        <Td><span className="flex items-center gap-2"><PlatformDot platform={r.platform} />{r.platform}</span></Td>
                        <Td right cls="font-semibold text-slate-900">{fmtNum(r.current)}</Td>
                        <Td right cls="text-slate-500">{fmtNum(r.startOfMonth)}</Td>
                        <Td right cls={r.growth != null && r.growth < 0 ? "text-red-600" : "text-slate-700"}>{fmtSigned(r.growth)}</Td>
                        <Td right cls="text-slate-500">{fmtPct(r.growthRate)}</Td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-semibold">
                      <Td>Total</Td>
                      <Td right>{snapCurrent ? fmtNum(snapCurrent) : "—"}</Td>
                      <Td right>{snapStart ? fmtNum(snapStart) : "—"}</Td>
                      <Td right>{fmtSigned(snapGrowth)}</Td>
                      <Td right>{fmtPct(followerGrowthRate)}</Td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {snapshot.every((r) => r.current == null) && (
                <p className="mt-3 text-xs text-slate-400">No follower counts logged yet — growth is from net-new followers. Enter each platform&apos;s follower count in &ldquo;Log a Week&rdquo; to track totals.</p>
              )}
            </Card>
          </div>
        </div>

        {weeklySeries.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-white py-10 text-center text-sm text-slate-400">No weeks logged in this date range.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="Views / Reach by Week">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={weeklySeries}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtCompact(v)} width={40} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => fmtNum(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {activePlatforms.map((p) => <Bar key={p} dataKey={p} stackId="v" fill={PLATFORM_COLOR[p] ?? "#94a3b8"} />)}
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Engagement Rate by Week (%)">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={weeklySeries}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="overall_er" name="All platforms" stroke="#60ab45" strokeWidth={2.5} dot={{ r: 3, fill: "#60ab45" }} connectNulls />
                  {activePlatforms.map((p) => (
                    <Line key={p} type="monotone" dataKey={`${p}_er`} name={p} stroke={PLATFORM_COLOR[p] ?? "#94a3b8"} strokeWidth={1.5} dot={false} connectNulls strokeDasharray="4 3" />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>
            <div className="lg:col-span-2">
              <Card title={hasFollowerCounts ? "Followers by Week" : "Net New Followers by Week"}>
                <ResponsiveContainer width="100%" height={240}>
                  {hasFollowerCounts ? (
                    <LineChart data={weeklySeries}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="week" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtCompact(v)} width={40} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => fmtNum(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {activePlatforms.map((p) => (
                        <Line key={p} type="monotone" dataKey={`${p}_followers`} name={p} stroke={PLATFORM_COLOR[p] ?? "#94a3b8"} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      ))}
                    </LineChart>
                  ) : (
                    <BarChart data={weeklySeries}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="week" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {activePlatforms.map((p) => <Bar key={p} dataKey={`${p}_net`} name={p} fill={PLATFORM_COLOR[p] ?? "#94a3b8"} />)}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </Card>
            </div>
          </div>
        )}
      </div>
    );
  }

  function Platforms() {
    if (stats.length === 0) return <Empty />;
    return (
      <div className="flex flex-col gap-5">
        {filterBar}
        <Card title={`Platform Comparison — ${RANGE_OPTIONS.find((o) => o.key === range)?.label}`}>
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr><Th>Platform</Th><Th right>Posts</Th><Th right>Views</Th><Th right>Views / Post</Th><Th right>Engagements</Th><Th right>Eng. Rate</Th><Th right>Net New Followers</Th><Th right>Leads</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {platformRows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">No weeks logged in this date range.</td></tr>
                )}
                {platformRows.map((r) => (
                  <tr key={r.platform}>
                    <Td><span className="flex items-center gap-2"><PlatformDot platform={r.platform} />{r.platform}</span></Td>
                    <Td right>{fmtNum(r.posts)}</Td>
                    <Td right>{fmtNum(r.views)}</Td>
                    <Td right cls="text-slate-500">{r.viewsPerPost != null ? fmtNum(Math.round(r.viewsPerPost)) : "—"}</Td>
                    <Td right>{fmtNum(r.engagements)}</Td>
                    <Td right>
                      <span className={r.engagementRate != null && r.engagementRate === bestEr ? "rounded bg-green-100 px-1.5 py-0.5 font-semibold text-green-700" : ""}>
                        {fmtPct(r.engagementRate, 2)}
                      </span>
                    </Td>
                    <Td right>{fmtSigned(r.netNewFollowers)}</Td>
                    <Td right>{fmtNum(r.leads)}</Td>
                  </tr>
                ))}
                {platformRows.length > 1 && (
                  <tr className="bg-slate-50 font-semibold">
                    <Td>Total</Td>
                    <Td right>{fmtNum(current.posts)}</Td>
                    <Td right>{fmtNum(current.views)}</Td>
                    <Td right>{current.posts ? fmtNum(Math.round(current.views / current.posts)) : "—"}</Td>
                    <Td right>{fmtNum(current.engagements)}</Td>
                    <Td right>{fmtPct(current.engagementRate, 2)}</Td>
                    <Td right>{fmtSigned(current.netNewFollowers)}</Td>
                    <Td right>{fmtNum(current.leads)}</Td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Monthly Summary">
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr><Th>Month</Th><Th>Platform</Th><Th right>Posts</Th><Th right>Views</Th><Th right>Engagements</Th><Th right>Eng. Rate</Th><Th right>Net New Followers</Th><Th right>Leads</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {months.map((m) => {
                  const rows = inRange(filtered, m, addMonths(m, 1));
                  const byPlatform = activePlatforms
                    .map((p) => ({ p, t: totalsOf(rows.filter((r) => r.platform === p), netNew) }))
                    .filter((x) => x.t.weeks > 0);
                  const all = totalsOf(rows, netNew);
                  return [
                    ...byPlatform.map(({ p, t }, i) => (
                      <tr key={`${m}-${p}`}>
                        <Td cls="font-medium text-slate-700">{i === 0 ? fmtMonth(m) : ""}</Td>
                        <Td><span className="flex items-center gap-2"><PlatformDot platform={p} />{p}</span></Td>
                        <Td right>{fmtNum(t.posts)}</Td>
                        <Td right>{fmtNum(t.views)}</Td>
                        <Td right>{fmtNum(t.engagements)}</Td>
                        <Td right>{fmtPct(t.engagementRate, 2)}</Td>
                        <Td right>{fmtSigned(t.netNewFollowers)}</Td>
                        <Td right>{fmtNum(t.leads)}</Td>
                      </tr>
                    )),
                    <tr key={`${m}-total`} className="bg-slate-50 font-semibold">
                      <Td>{byPlatform.length === 0 ? fmtMonth(m) : ""}</Td>
                      <Td>All platforms</Td>
                      <Td right>{fmtNum(all.posts)}</Td>
                      <Td right>{fmtNum(all.views)}</Td>
                      <Td right>{fmtNum(all.engagements)}</Td>
                      <Td right>{fmtPct(all.engagementRate, 2)}</Td>
                      <Td right>{fmtSigned(all.netNewFollowers)}</Td>
                      <Td right>{fmtNum(all.leads)}</Td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  function WeeklyLog() {
    if (stats.length === 0) return <Empty />;
    return (
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr><Th>Week</Th><Th right>Posts</Th><Th right>Views</Th><Th right>Engagements</Th><Th right>Eng. Rate</Th><Th right>Net New Followers</Th><Th right>Leads</Th><Th right>{""}</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allWeeks.map((w) => {
                const rows = stats.filter((s) => s.weekStart === w);
                const t = totalsOf(rows, netNew);
                const open = expandedWeek === w;
                return [
                  <tr key={w} className="cursor-pointer hover:bg-slate-50" onClick={() => setExpandedWeek(open ? null : w)}>
                    <Td>
                      <span className="flex items-center gap-2 font-medium text-slate-800">
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
                        {fmtWeekRange(w)}
                        <span className="text-xs font-normal text-slate-400">{rows.length} {rows.length === 1 ? "platform" : "platforms"}</span>
                      </span>
                    </Td>
                    <Td right>{fmtNum(t.posts)}</Td>
                    <Td right>{fmtNum(t.views)}</Td>
                    <Td right>{fmtNum(t.engagements)}</Td>
                    <Td right>{fmtPct(t.engagementRate, 2)}</Td>
                    <Td right>{fmtSigned(t.netNewFollowers)}</Td>
                    <Td right>{fmtNum(t.leads)}</Td>
                    <td className="whitespace-nowrap px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {canEdit && (
                        <span className="inline-flex gap-3">
                          <button onClick={() => openEntry(w)} className="text-slate-400 hover:text-brand-600" aria-label={`Edit week of ${fmtShortDate(w)}`}><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => handleDeleteWeek(w)} className="text-red-400 hover:text-red-600" aria-label={`Delete week of ${fmtShortDate(w)}`}><Trash2 className="h-4 w-4" /></button>
                        </span>
                      )}
                    </td>
                  </tr>,
                  open && (
                    <tr key={`${w}-detail`} className="bg-slate-50/60">
                      <td colSpan={8} className="px-4 pb-4 pt-1">
                        <div className="overflow-x-auto rounded-md border bg-white">
                          <table className="w-full">
                            <thead className="bg-slate-50">
                              <tr><Th>Platform</Th><Th right>Posts</Th><Th right>Views</Th><Th right>Likes</Th><Th right>Comments</Th><Th right>Shares</Th><Th right>Saves</Th><Th right>Eng. Rate</Th><Th right>Followers</Th><Th right>Net New</Th><Th right>Leads</Th><Th>Notes</Th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {platformsIn(rows).filter((p) => rows.some((r) => r.platform === p)).map((p) => {
                                const s = rows.find((r) => r.platform === p)!;
                                const eng = engagementsOf(s);
                                return (
                                  <tr key={s.id}>
                                    <Td><span className="flex items-center gap-2"><PlatformDot platform={p} />{p}</span></Td>
                                    <Td right>{fmtNum(s.posts)}</Td>
                                    <Td right>{fmtNum(s.views)}</Td>
                                    <Td right>{fmtNum(s.likes)}</Td>
                                    <Td right>{fmtNum(s.comments)}</Td>
                                    <Td right>{fmtNum(s.shares)}</Td>
                                    <Td right>{fmtNum(s.saves)}</Td>
                                    <Td right>{s.views && eng != null ? fmtPct(eng / s.views, 2) : "—"}</Td>
                                    <Td right>{fmtNum(s.followers)}</Td>
                                    <Td right>{fmtSigned(netNew.get(s.id))}</Td>
                                    <Td right>{fmtNum(s.leads)}</Td>
                                    <Td cls="max-w-[240px] truncate text-slate-500">{s.notes ?? ""}</Td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function Entry() {
    const weekExists = stats.some((s) => s.weekStart === entryWeek);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setEntryWeek(addDays(entryWeek, -7))} className="rounded-md border p-1.5 text-slate-500 hover:bg-slate-50" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Week of</p>
              <p className="text-sm font-semibold text-slate-900">{fmtWeekRange(entryWeek)}</p>
            </div>
            <button onClick={() => setEntryWeek(addDays(entryWeek, 7))} className="rounded-md border p-1.5 text-slate-500 hover:bg-slate-50" aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
            <input
              type="date"
              value={entryWeek}
              onChange={(e) => e.target.value && setEntryWeek(mondayOf(e.target.value))}
              className="ml-2 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-600"
              aria-label="Pick week"
            />
          </div>
          <span className={`text-xs font-medium ${weekExists ? "text-amber-600" : "text-slate-400"}`}>
            {weekExists ? "Editing a week that's already logged" : "New week"}
          </span>
        </div>

        <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">How to fill this in</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Pick the week above (Monday–Sunday). Log it once the week is over, or update it as the numbers come in.</li>
            <li>For each platform, open its <strong>Insights / Analytics</strong>, set it to that week (or &ldquo;last 7 days&rdquo;), and copy the numbers into that platform&apos;s column.</li>
            <li>For <strong>Total followers</strong>, type the follower count shown on the profile. Net new followers works itself out from last week&apos;s total.</li>
            <li>Leave anything you don&apos;t have blank; don&apos;t type 0 for numbers you don&apos;t know. Platforms left completely blank aren&apos;t saved.</li>
          </ol>
        </div>

        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Metric</Th>
                  {platforms.map((p) => (
                    <th key={p} className="px-2 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <span className="flex items-center gap-1.5"><PlatformDot platform={p} />{p}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ENTRY_FIELDS.map((f) => (
                  <tr key={f.key}>
                    <td className="px-4 py-2 align-top">
                      <p className="whitespace-nowrap text-sm text-slate-700">{f.label}</p>
                      <p className="mt-0.5 max-w-[220px] text-[11px] leading-snug text-slate-400">{f.hint}</p>
                    </td>
                    {platforms.map((p) => {
                      const c = cells[p] ?? emptyCell();
                      let placeholder = "";
                      if (f.key === "netNewFollowers") {
                        const fol = toInt(c.followers);
                        const prev = followersBefore(stats, p, entryWeek);
                        if (fol != null && prev != null) placeholder = `auto: ${fmtSigned(fol - prev)}`;
                      }
                      if (f.key === "followers") {
                        const prev = followersBefore(stats, p, entryWeek);
                        if (prev != null) placeholder = `last: ${fmtNum(prev)}`;
                      }
                      return (
                        <td key={p} className="px-2 py-1.5">
                          <input
                            inputMode="numeric"
                            value={c[f.key]}
                            placeholder={placeholder}
                            onChange={(e) => setCell(p, f.key, e.target.value)}
                            className="w-full min-w-[96px] rounded-md border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                            aria-label={`${p} ${f.label}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-slate-600">Engagement rate</td>
                  {platforms.map((p) => {
                    const c = cells[p] ?? emptyCell();
                    const eng = engagementsOf({ likes: toInt(c.likes), comments: toInt(c.comments), shares: toInt(c.shares), saves: toInt(c.saves) });
                    const views = toInt(c.views);
                    return (
                      <td key={p} className="px-3 py-2 text-right text-sm tabular-nums text-slate-700">
                        {eng != null && views ? <>{fmtPct(eng / views, 2)} <span className="text-xs text-slate-400">({fmtNum(eng)})</span></> : "—"}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-600">Notes</td>
                  {platforms.map((p) => (
                    <td key={p} className="px-2 py-1.5">
                      <input
                        value={(cells[p] ?? emptyCell()).notes}
                        onChange={(e) => setCell(p, "notes", e.target.value)}
                        className="w-full min-w-[96px] rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                        aria-label={`${p} notes`}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saveWeek.isPending}
            className="rounded-md bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saveWeek.isPending ? "Saving…" : "Save Week"}
          </button>
          {savedAt && <span className="text-sm text-green-600">Saved at {savedAt}</span>}
          {entryError && <span className="text-sm text-red-600">{entryError}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Social Media"
        description={`Weekly posts, reach, engagement, followers and leads by platform${latestWeek ? ` · last logged week of ${fmtShortDate(latestWeek)}` : ""}`}
        action={
          canEdit ? (
            <button
              onClick={() => openEntry(mondayOf(today))}
              className="flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" /> Log This Week
            </button>
          ) : undefined
        }
      />

      <div className="flex gap-0 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${tab === t.key ? "border-brand-500 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          {tab === "overview" && Overview()}
          {tab === "platforms" && Platforms()}
          {tab === "log" && WeeklyLog()}
          {tab === "entry" && canEdit && Entry()}
        </>
      )}
      {canEdit && (
        <GoalsDialog
          open={goalsOpen}
          onOpenChange={setGoalsOpen}
          goals={goals}
          isDefault={!goalsRecord?.id}
          saving={saveGoals.isPending}
          onSave={(next) => saveGoals.mutateAsync({ id: goalsRecord?.id ?? null, goals: next })}
        />
      )}
      {confirmDialog}
    </div>
  );
}
