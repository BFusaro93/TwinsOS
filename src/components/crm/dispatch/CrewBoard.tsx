"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  Truck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { cn, formatHours } from "@/lib/utils";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import { useAssets } from "@/lib/hooks/use-assets";
import { useCrews, useCrewDailyMembers, useSetCrewDailyMember, useClearCrewDailyMember } from "@/lib/hooks/use-employees";
import { useUpdateVisit, useVisitsForDate } from "@/lib/hooks/use-crm-jobs";
import {
  useClearCrewDailyAsset,
  useClearCrewDefaultAsset,
  useCrewDailyAssets,
  useCrewDefaultAssets,
  useJobAssetsForJobs,
  useSetCrewDailyAsset,
  useSetCrewDefaultAsset,
} from "@/lib/hooks/use-crew-board";
import type { CRMJobVisit } from "@/types/crm-jobs";
import type { Asset } from "@/types/cmms";
import { visitBudgetState } from "./budget-progress";
import { crewColor, textOn, tint } from "./crew-color";

type DragItem =
  | { kind: "member"; id: string; fromCrewId: string }
  | { kind: "asset"; id: string; fromCrewId: string | null }
  | { kind: "job"; jobId: string; visitIds: string[]; fromCrewId: string | null };

const TV_REFRESH_MS = 30_000;
const CAPACITY_HOURS_PER_PERSON = 8;

// Same rule the Dispatch Board uses: the visit's own crew, else its job's,
// and crewUnassigned pins it to no crew.
function visitCrewId(v: CRMJobVisit): string | null {
  if (v.crewUnassigned) return null;
  return v.crewId ?? v.job?.crewId ?? null;
}

function isVehicle(a: Pick<Asset, "assetType">): boolean {
  return /truck|vehicle|van|pickup|trailer/i.test(a.assetType ?? "");
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/**
 * Trello-style crew board: a column per crew showing who is on it today, which
 * equipment is loaded on it, and which jobs it is running. Everything is
 * draggable and writes through to the same tables the Dispatch Board uses, so
 * the two stay in sync. Equipment can be pinned as a crew's default so it shows
 * up on that crew every day without being re-assigned. `?tv=1` renders
 * chrome-free and auto-refreshes, for the shop wall.
 */
export function CrewBoard() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const { today: orgToday } = useOrgDates();
  const tv = searchParams.get("tv") === "1";
  const date = searchParams.get("date") ?? orgToday();

  function setParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) params.delete(k); else params.set(k, v);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const { data: crews = [] } = useCrews(true);
  const { data: visits = [] } = useVisitsForDate(date);
  const { data: dailyMembers = [] } = useCrewDailyMembers(date);
  const { data: dailyAssets = [] } = useCrewDailyAssets(date);
  const { data: defaultAssets = [] } = useCrewDefaultAssets();
  const { data: assets = [] } = useAssets();
  const setMember = useSetCrewDailyMember();
  const clearMember = useClearCrewDailyMember();
  const setDailyAsset = useSetCrewDailyAsset();
  const clearDailyAsset = useClearCrewDailyAsset();
  const setDefaultAsset = useSetCrewDefaultAsset();
  const clearDefaultAsset = useClearCrewDefaultAsset();
  const updateVisit = useUpdateVisit();

  const [drag, setDrag] = useState<DragItem | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [yardSearch, setYardSearch] = useState("");

  // The wall display has no one to refresh it — poll instead.
  useEffect(() => {
    if (!tv) return;
    const t = setInterval(() => {
      void qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
      void qc.invalidateQueries({ queryKey: ["crm-crew-daily-members"] });
      void qc.invalidateQueries({ queryKey: ["crm-crew-daily-assets"] });
      void qc.invalidateQueries({ queryKey: ["crm-crew-default-assets"] });
      void qc.invalidateQueries({ queryKey: ["crm-job-assets"] });
    }, TV_REFRESH_MS);
    return () => clearInterval(t);
  }, [tv, qc]);

  const liveVisits = useMemo(() => visits.filter((v) => v.status !== "cancelled"), [visits]);
  const jobIds = useMemo(() => [...new Set(liveVisits.map((v) => v.jobId))], [liveVisits]);
  const { data: jobAssets = [] } = useJobAssetsForJobs(jobIds);
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const crewNameById = useMemo(() => new Map(crews.map((c) => [c.id, c.name])), [crews]);
  const colorByCrew = useMemo(() => new Map(crews.map((c, i) => [c.id, crewColor(c.color, i)])), [crews]);

  // Who is on which crew today: default roster, then same-day overrides on top.
  const membersByCrew = useMemo(() => {
    const override = new Map(dailyMembers.map((o) => [o.member_id, o.crew_id]));
    const m = new Map<string, { id: string; name: string; isForeman: boolean; moved: boolean }[]>();
    for (const c of crews) {
      for (const mem of c.members ?? []) {
        const crewId = override.get(mem.id) ?? c.id;
        const list = m.get(crewId) ?? [];
        list.push({ id: mem.id, name: mem.employeeName ?? "Member", isForeman: mem.isForeman, moved: crewId !== c.id });
        m.set(crewId, list);
      }
    }
    return m;
  }, [crews, dailyMembers]);
  const defaultCrewByMember = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of crews) for (const mem of c.members ?? []) m.set(mem.id, c.id);
    return m;
  }, [crews]);

  // An asset's crew today: that day's row if there is one (crewId null = pulled
  // off every crew), otherwise its default crew.
  const defaultCrewByAsset = useMemo(() => new Map(defaultAssets.map((d) => [d.assetId, d.crewId])), [defaultAssets]);
  const assetCrew = useMemo(() => {
    const m = new Map<string, string | null>(defaultAssets.map((d) => [d.assetId, d.crewId]));
    for (const d of dailyAssets) m.set(d.assetId, d.crewId);
    return m;
  }, [defaultAssets, dailyAssets]);

  // Jobs per crew, folded to one card per job (a job's services are separate visits).
  const jobsByCrew = useMemo(() => {
    const m = new Map<string, { jobId: string; visits: CRMJobVisit[] }[]>();
    for (const v of liveVisits) {
      const key = visitCrewId(v) ?? "unassigned";
      const list = m.get(key) ?? [];
      const existing = list.find((j) => j.jobId === v.jobId);
      if (existing) existing.visits.push(v); else list.push({ jobId: v.jobId, visits: [v] });
      m.set(key, list);
    }
    return m;
  }, [liveVisits]);

  const neededByCrew = useMemo(() => {
    const m = new Map<string, Map<string, string[]>>(); // crew -> assetId -> client names
    for (const [crewId, jobs] of jobsByCrew) {
      if (crewId === "unassigned") continue;
      const need = new Map<string, string[]>();
      for (const j of jobs) {
        const client = j.visits[0]?.clientName ?? "job";
        for (const ja of jobAssets.filter((x) => x.jobId === j.jobId)) {
          need.set(ja.assetId, [...(need.get(ja.assetId) ?? []), client]);
        }
      }
      m.set(crewId, need);
    }
    return m;
  }, [jobsByCrew, jobAssets]);

  const yard = useMemo(() => {
    const q = yardSearch.trim().toLowerCase();
    return assets
      .filter((a) => a.status === "active" && !assetCrew.get(a.id))
      .filter((a) => !q || `${a.name} ${a.assetTag} ${a.assetType}`.toLowerCase().includes(q))
      .sort((a, b) => Number(isVehicle(b)) - Number(isVehicle(a)) || a.name.localeCompare(b.name));
  }, [assets, assetCrew, yardSearch]);

  const fail = (msg: string) => () => toast.error(msg);

  /** Put an asset on a crew for today. Landing on its own default crew just clears the override. */
  function loadAssetOnCrew(assetId: string, crewId: string) {
    if (defaultCrewByAsset.get(assetId) === crewId) {
      clearDailyAsset.mutate({ assetId, workDate: date }, { onError: fail("Couldn't assign equipment") });
    } else {
      setDailyAsset.mutate({ assetId, crewId, workDate: date }, { onError: fail("Couldn't assign equipment") });
    }
  }

  /** Take an asset off its crew for today. A default asset needs an explicit "off" row to stay off. */
  function unloadAsset(assetId: string) {
    if (defaultCrewByAsset.has(assetId)) {
      setDailyAsset.mutate({ assetId, crewId: null, workDate: date }, { onError: fail("Couldn't unload equipment") });
    } else {
      clearDailyAsset.mutate({ assetId, workDate: date }, { onError: fail("Couldn't unload equipment") });
    }
  }

  function toggleDefault(assetId: string, crewId: string) {
    if (defaultCrewByAsset.get(assetId) === crewId) {
      clearDefaultAsset.mutate({ assetId }, { onError: fail("Couldn't remove default") });
      return;
    }
    // Pinning makes today's override for this crew redundant — drop it.
    setDefaultAsset.mutate(
      { assetId, crewId },
      {
        onSuccess: () => {
          if (dailyAssets.some((d) => d.assetId === assetId)) clearDailyAsset.mutate({ assetId, workDate: date });
        },
        onError: fail("Couldn't set default"),
      }
    );
  }

  function handleDropOnCrew(crewId: string) {
    const item = drag;
    setDrag(null);
    setOverKey(null);
    if (!item) return;
    if (item.kind === "member") {
      if (item.fromCrewId === crewId) return;
      // Dropping back on their default crew just clears the day's override.
      const op = defaultCrewByMember.get(item.id) === crewId
        ? clearMember.mutateAsync({ memberId: item.id, workDate: date })
        : setMember.mutateAsync({ memberId: item.id, crewId, workDate: date });
      op.catch(fail("Couldn't move that person"));
    } else if (item.kind === "asset") {
      if (item.fromCrewId === crewId) return;
      loadAssetOnCrew(item.id, crewId);
    } else {
      if (item.fromCrewId === crewId) return;
      const key = ["crm-job-visits", "date", date, date];
      const previous = qc.getQueryData<CRMJobVisit[]>(key);
      const ids = new Set(item.visitIds);
      qc.setQueryData<CRMJobVisit[]>(key, (old) =>
        (old ?? []).map((v) => (ids.has(v.id) ? { ...v, crewId, crewUnassigned: false } : v))
      );
      Promise.all(
        item.visitIds.map((id) =>
          updateVisit.mutateAsync({ id, jobId: item.jobId, updates: { crew_id: crewId, crew_unassigned: false } })
        )
      ).catch(() => {
        qc.setQueryData(key, previous);
        toast.error("Couldn't move that job");
      });
    }
  }

  function handleDropOnYard() {
    const item = drag;
    setDrag(null);
    setOverKey(null);
    if (item?.kind === "asset" && item.fromCrewId) unloadAsset(item.id);
  }

  if (!permissionsLoading && !can("sched_dispatch_board")) {
    return <EmptyState icon={Users} title="No access" description="You don't have permission to view the Crew Board." />;
  }

  const dateObj = new Date(`${date}T12:00:00`);
  const dateLabel = dateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const isToday = date === orgToday();
  const big = tv; // scale type up for across-the-room reading
  const endDrag = () => { setDrag(null); setOverKey(null); };

  const body = (
    <div className={cn("flex h-full min-h-0 flex-col gap-4", tv && "p-6")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className={cn("font-bold leading-tight text-slate-900 dark:text-neutral-100", big ? "text-4xl" : "text-xl")}>
              Crew Board
            </h1>
            {!tv && (
              <p className="text-sm text-muted-foreground">
                Who&apos;s on each crew, what they&apos;re taking, and where they&apos;re going — drag to change
              </p>
            )}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border bg-card p-1 shadow-sm">
            <Button size="sm" variant="ghost" className={cn(big ? "h-11 w-11 p-0" : "h-8 w-8 p-0")} onClick={() => setParams({ date: shiftDate(date, -1) })} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className={cn("flex items-center gap-1.5 px-2 font-semibold", big ? "text-2xl" : "text-sm")}>
              <CalendarDays className={cn("text-brand-600", big ? "h-6 w-6" : "h-4 w-4")} />
              {dateLabel}
              {isToday && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">Today</span>}
            </span>
            <Button size="sm" variant="ghost" className={cn(big ? "h-11 w-11 p-0" : "h-8 w-8 p-0")} onClick={() => setParams({ date: shiftDate(date, 1) })} aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {!isToday && (
            <Button size="sm" variant="outline" className={cn(big ? "h-11 text-base" : "h-8 text-xs")} onClick={() => setParams({ date: null })}>
              Today
            </Button>
          )}
          {!tv && (
            <Button asChild size="sm" variant="outline" className="h-8 text-xs">
              <Link href={`/crm/scheduling/dispatch?date=${date}`}>Dispatch Board</Link>
            </Button>
          )}
          <Button size="sm" variant="outline" className={cn("gap-1", big ? "h-11 text-base" : "h-8 text-xs")} onClick={() => setParams({ tv: tv ? null : "1" })}>
            {tv ? <><Minimize2 className="h-4 w-4" /> Exit TV</> : <><Maximize2 className="h-3.5 w-3.5" /> TV mode</>}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Equipment yard — everything not on a crew today. Hidden on the TV. */}
        {!tv && (
          <aside
            onDragOver={(e) => { if (drag?.kind === "asset" && drag.fromCrewId) { e.preventDefault(); setOverKey("yard"); } }}
            onDragLeave={() => overKey === "yard" && setOverKey(null)}
            onDrop={(e) => { e.preventDefault(); handleDropOnYard(); }}
            className={cn(
              "flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition",
              overKey === "yard" && "ring-2 ring-brand-400"
            )}
          >
            <div className="border-b bg-slate-100 px-3 py-2.5 dark:bg-neutral-800">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-neutral-300">
                <Wrench className="h-3.5 w-3.5" /> Equipment yard
                <span className="ml-auto rounded-full bg-slate-200 px-1.5 text-[10px] dark:bg-neutral-700">{yard.length}</span>
              </div>
              <Input value={yardSearch} onChange={(e) => setYardSearch(e.target.value)} placeholder="Search equipment…" className="mt-2 h-8 bg-background text-xs" />
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
              {yard.length === 0 && <p className="p-2 text-xs text-muted-foreground">Everything is out on a crew.</p>}
              {yard.map((a) => (
                <AssetCard key={a.id} asset={a} onDragStart={() => setDrag({ kind: "asset", id: a.id, fromCrewId: null })} onDragEnd={endDrag} />
              ))}
            </div>
            <p className="border-t px-3 py-2 text-[10px] text-muted-foreground">Drag onto a crew. Drop a loaded item here to unload it.</p>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 gap-4 overflow-x-auto pb-2">
          {crews.map((crew) => {
            const color = colorByCrew.get(crew.id) ?? "#64748b";
            const fg = textOn(color);
            const members = membersByCrew.get(crew.id) ?? [];
            const loaded = [...assetCrew.entries()]
              .filter(([, c]) => c === crew.id)
              .map(([id]) => assetById.get(id))
              .filter((a): a is Asset => !!a)
              .sort((a, b) => Number(isVehicle(b)) - Number(isVehicle(a)) || a.name.localeCompare(b.name));
            const jobs = jobsByCrew.get(crew.id) ?? [];
            const need = neededByCrew.get(crew.id) ?? new Map<string, string[]>();
            const missing = [...need.keys()].filter((id) => assetCrew.get(id) !== crew.id);
            const budget = jobs.reduce((s, j) => s + j.visits.reduce((t, v) => t + (v.budgetedHours ?? 0), 0), 0);
            const capacity = members.length * CAPACITY_HOURS_PER_PERSON;
            const loadPct = capacity > 0 ? Math.min(100, (budget / capacity) * 100) : 0;
            const overloaded = capacity > 0 && budget > capacity;
            const key = `crew:${crew.id}`;
            return (
              <section
                key={crew.id}
                onDragOver={(e) => { if (drag) { e.preventDefault(); if (overKey !== key) setOverKey(key); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverKey(null); }}
                onDrop={(e) => { e.preventDefault(); handleDropOnCrew(crew.id); }}
                className={cn(
                  "flex shrink-0 flex-col overflow-hidden rounded-xl border-2 bg-card shadow-sm transition",
                  big ? "w-[28rem]" : "w-80",
                  overKey === key && "scale-[1.01] shadow-lg"
                )}
                style={{ borderColor: overKey === key ? color : tint(color, 45), backgroundColor: tint(color, overKey === key ? 14 : 6) }}
              >
                <header className="px-4 py-3" style={{ backgroundColor: color, color: fg }}>
                  <div className="flex items-center gap-2">
                    <Truck className={cn("opacity-90", big ? "h-7 w-7" : "h-5 w-5")} />
                    <span className={cn("truncate font-bold", big ? "text-3xl" : "text-lg")}>{crew.name}</span>
                  </div>
                  <div className={cn("mt-2 flex items-center gap-2 font-medium", big ? "text-base" : "text-xs")}>
                    <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5"><Users className="h-3 w-3" /> {members.length}</span>
                    <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5"><ClipboardList className="h-3 w-3" /> {jobs.length} job{jobs.length === 1 ? "" : "s"}</span>
                    <span className="ml-auto tabular-nums">{formatHours(budget, 1)}h{capacity > 0 && ` / ${capacity}h`}</span>
                  </div>
                  {capacity > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25">
                      <div className={cn("h-full rounded-full", overloaded ? "bg-red-300" : "bg-white/90")} style={{ width: `${loadPct}%` }} />
                    </div>
                  )}
                </header>

                <div className="flex-1 space-y-4 overflow-y-auto p-3">
                  <Lane title="People" icon={<Users className="h-3.5 w-3.5" />} color={color} big={big}>
                    {members.length === 0 && <Empty big={big}>No one assigned</Empty>}
                    {members.map((m) => (
                      <div
                        key={m.id}
                        draggable={!tv}
                        onDragStart={() => setDrag({ kind: "member", id: m.id, fromCrewId: crew.id })}
                        onDragEnd={endDrag}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5 shadow-sm",
                          big ? "text-lg" : "text-xs",
                          !tv && "cursor-grab active:cursor-grabbing"
                        )}
                      >
                        <span
                          className={cn("flex shrink-0 items-center justify-center rounded-full font-bold", big ? "h-9 w-9 text-sm" : "h-6 w-6 text-[10px]")}
                          style={{ backgroundColor: color, color: fg }}
                        >
                          {initials(m.name)}
                        </span>
                        <span className="truncate font-medium">{m.name}</span>
                        {m.isForeman && <span className="rounded bg-slate-200 px-1.5 text-[10px] font-semibold uppercase dark:bg-neutral-700">Lead</span>}
                        {m.moved && <span className="ml-auto text-[10px] font-medium text-amber-600 dark:text-amber-400">today only</span>}
                      </div>
                    ))}
                  </Lane>

                  <Lane title="Equipment" icon={<Wrench className="h-3.5 w-3.5" />} color={color} big={big}>
                    {loaded.length === 0 && missing.length === 0 && <Empty big={big}>Nothing loaded</Empty>}
                    {loaded.map((a) => (
                      <AssetCard
                        key={a.id}
                        asset={a}
                        big={big}
                        draggable={!tv}
                        needed={need.has(a.id)}
                        isDefault={defaultCrewByAsset.get(a.id) === crew.id}
                        onToggleDefault={tv ? undefined : () => toggleDefault(a.id, crew.id)}
                        onDragStart={() => setDrag({ kind: "asset", id: a.id, fromCrewId: crew.id })}
                        onDragEnd={endDrag}
                      />
                    ))}
                    {missing.map((id) => {
                      const a = assetById.get(id);
                      const holder = assetCrew.get(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={tv}
                          onClick={() => loadAssetOnCrew(id, crew.id)}
                          title={`Needed for ${[...new Set(need.get(id))].join(", ")} — click to load on ${crew.name}`}
                          className={cn(
                            "flex w-full items-center gap-1.5 rounded-lg border border-dashed border-amber-500 bg-amber-50 px-2 py-1.5 text-left text-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
                            big ? "text-lg" : "text-xs"
                          )}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            Needs {a?.name ?? "equipment"}
                            {holder ? ` (on ${crewNameById.get(holder) ?? "another crew"})` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </Lane>

                  <Lane title="Jobs" icon={<ClipboardList className="h-3.5 w-3.5" />} color={color} big={big}>
                    {jobs.length === 0 && <Empty big={big}>No jobs scheduled</Empty>}
                    {jobs.map((j) => (
                      <JobCard
                        key={j.jobId}
                        visits={j.visits}
                        color={color}
                        big={big}
                        draggable={!tv}
                        onDragStart={() => setDrag({ kind: "job", jobId: j.jobId, visitIds: j.visits.map((v) => v.id), fromCrewId: crew.id })}
                        onDragEnd={endDrag}
                      />
                    ))}
                  </Lane>
                </div>
              </section>
            );
          })}

          {crews.length === 0 && <p className="p-6 text-sm text-muted-foreground">No active crews yet — add them under Team.</p>}

          {(jobsByCrew.get("unassigned")?.length ?? 0) > 0 && (
            <section className={cn("flex shrink-0 flex-col overflow-hidden rounded-xl border-2 border-dashed bg-muted/30", big ? "w-[28rem]" : "w-80")}>
              <header className="border-b bg-slate-200 px-4 py-3 dark:bg-neutral-800">
                <span className={cn("font-bold", big ? "text-3xl" : "text-lg")}>Unassigned jobs</span>
                <p className="text-xs text-muted-foreground">Drag onto a crew to assign</p>
              </header>
              <div className="space-y-2 overflow-y-auto p-3">
                {jobsByCrew.get("unassigned")!.map((j) => (
                  <JobCard
                    key={j.jobId}
                    visits={j.visits}
                    color="#64748b"
                    big={big}
                    draggable={!tv}
                    onDragStart={() => setDrag({ kind: "job", jobId: j.jobId, visitIds: j.visits.map((v) => v.id), fromCrewId: null })}
                    onDragEnd={endDrag}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );

  if (!tv) return body;
  // TV mode covers the whole app shell (sidebar, top bar) — nothing to navigate
  // on a wall display, and it keeps the layout files untouched.
  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-slate-50 dark:bg-background">
      <button
        type="button"
        onClick={() => setParams({ tv: null })}
        className="absolute right-2 top-2 z-10 rounded p-1 text-muted-foreground/40 hover:text-foreground"
        aria-label="Exit TV mode"
      >
        <X className="h-4 w-4" />
      </button>
      {body}
    </div>
  );
}

function Lane({ title, icon, color, big, children }: { title: string; icon: React.ReactNode; color: string; big: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div
        className={cn("flex items-center gap-1.5 border-b pb-1 font-bold uppercase tracking-wide", big ? "text-sm" : "text-[10px]")}
        style={{ color, borderColor: tint(color, 35) }}
      >
        {icon}
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Empty({ big, children }: { big: boolean; children: React.ReactNode }) {
  return <p className={cn("px-0.5 italic text-muted-foreground/70", big ? "text-base" : "text-xs")}>{children}</p>;
}

function AssetCard({
  asset,
  big,
  draggable = true,
  needed,
  isDefault,
  onToggleDefault,
  onDragStart,
  onDragEnd,
}: {
  asset: Asset;
  big?: boolean;
  draggable?: boolean;
  needed?: boolean;
  /** This crew's default equipment (pinned). */
  isDefault?: boolean;
  /** Present only for a loaded card — pins/unpins it as the crew's default. */
  onToggleDefault?: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const vehicle = isVehicle(asset);
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", asset.id); onDragStart(); }}
      onDragEnd={onDragEnd}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5 shadow-sm",
        big ? "text-lg" : "text-xs",
        draggable && "cursor-grab active:cursor-grabbing",
        vehicle ? "border-slate-400 bg-slate-100 dark:border-neutral-500 dark:bg-neutral-800" : ""
      )}
    >
      {vehicle ? <Truck className={cn("shrink-0", big ? "h-5 w-5" : "h-4 w-4")} /> : <Wrench className={cn("shrink-0 text-muted-foreground", big ? "h-5 w-5" : "h-3.5 w-3.5")} />}
      <span className="truncate font-semibold">{asset.name}</span>
      {asset.assetTag && <span className="shrink-0 text-muted-foreground">#{asset.assetTag}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {needed && <span className="rounded bg-emerald-100 px-1 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Job needs</span>}
        {isDefault && !onToggleDefault && <Pin className="h-3 w-3 text-brand-600" />}
        {onToggleDefault && (
          <button
            type="button"
            onClick={onToggleDefault}
            title={isDefault ? "Default for this crew — click to remove" : "Make this crew's default"}
            className={cn("rounded p-0.5 transition", isDefault ? "text-brand-600" : "text-muted-foreground/50 hover:text-brand-600")}
          >
            {isDefault ? <Pin className="h-3.5 w-3.5 fill-current" /> : <PinOff className="h-3.5 w-3.5" />}
          </button>
        )}
      </span>
    </div>
  );
}

function JobCard({
  visits,
  color,
  big,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  visits: CRMJobVisit[];
  color: string;
  big: boolean;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const first = visits[0];
  const services = [...new Set(visits.flatMap((v) => (v.serviceNames ?? []).filter(Boolean) as string[]))].join(", ");
  const budget = visits.reduce((s, v) => s + (v.budgetedHours ?? 0), 0);
  const actual = visits.reduce((s, v) => s + (v.actualHours ?? 0), 0);
  const state = visitBudgetState({ budgetedHours: budget, actualHours: actual });
  const done = visits.every((v) => ["completed", "skipped"].includes(v.status));
  const started = visits.some((v) => v.status === "in_progress");
  const barColor = state ? (state.level === "over" ? "#dc2626" : state.level === "warn" ? "#f59e0b" : "#22c55e") : color;
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", first.jobId); onDragStart(); }}
      onDragEnd={onDragEnd}
      className={cn(
        "overflow-hidden rounded-lg border border-l-4 bg-background px-2.5 py-1.5 shadow-sm",
        big ? "text-lg" : "text-xs",
        draggable && "cursor-grab active:cursor-grabbing",
        done && "opacity-60"
      )}
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{first.clientName ?? "Client"}</div>
          {services && <div className="truncate text-muted-foreground">{services}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end">
          {budget > 0 && <span className="font-medium tabular-nums">{formatHours(budget, 1)}h</span>}
          {done ? (
            <span className="text-[10px] font-semibold uppercase text-emerald-600">Done</span>
          ) : started ? (
            <span className="text-[10px] font-semibold uppercase text-blue-600">On site</span>
          ) : null}
        </div>
      </div>
      {state && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
          <div className="h-full rounded-full" style={{ width: `${state.fillPct}%`, backgroundColor: barColor }} />
        </div>
      )}
    </div>
  );
}
