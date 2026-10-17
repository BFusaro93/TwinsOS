"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, Maximize2, Minimize2, Truck, Users, X } from "lucide-react";
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
  useCrewDailyAssets,
  useJobAssetsForJobs,
  useSetCrewDailyAsset,
} from "@/lib/hooks/use-crew-board";
import type { CRMJobVisit } from "@/types/crm-jobs";
import type { Asset } from "@/types/cmms";
import { visitBudgetState, BUDGET_BAR_CLASS } from "./budget-progress";

type DragItem =
  | { kind: "member"; id: string; fromCrewId: string }
  | { kind: "asset"; id: string; fromCrewId: string | null }
  | { kind: "job"; jobId: string; visitIds: string[]; fromCrewId: string | null };

const TV_REFRESH_MS = 30_000;

// Same rule the Dispatch Board uses: the visit's own crew, else its job's,
// and crewUnassigned pins it to no crew.
function visitCrewId(v: CRMJobVisit): string | null {
  if (v.crewUnassigned) return null;
  return v.crewId ?? v.job?.crewId ?? null;
}

function isVehicle(a: Pick<Asset, "assetType">): boolean {
  return /truck|vehicle|van|pickup|trailer/i.test(a.assetType ?? "");
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
 * the two stay in sync. `?tv=1` renders chrome-free and auto-refreshes, for the
 * shop wall.
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
  const { data: assets = [] } = useAssets();
  const setMember = useSetCrewDailyMember();
  const clearMember = useClearCrewDailyMember();
  const setAsset = useSetCrewDailyAsset();
  const clearAsset = useClearCrewDailyAsset();
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
      void qc.invalidateQueries({ queryKey: ["crm-job-assets"] });
    }, TV_REFRESH_MS);
    return () => clearInterval(t);
  }, [tv, qc]);

  const liveVisits = useMemo(() => visits.filter((v) => v.status !== "cancelled"), [visits]);
  const jobIds = useMemo(() => [...new Set(liveVisits.map((v) => v.jobId))], [liveVisits]);
  const { data: jobAssets = [] } = useJobAssetsForJobs(jobIds);
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const crewNameById = useMemo(() => new Map(crews.map((c) => [c.id, c.name])), [crews]);

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

  const assetCrew = useMemo(() => new Map(dailyAssets.map((a) => [a.assetId, a.crewId])), [dailyAssets]);

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
      .filter((a) => a.status === "active" && !assetCrew.has(a.id))
      .filter((a) => !q || `${a.name} ${a.assetTag} ${a.assetType}`.toLowerCase().includes(q))
      .sort((a, b) => Number(isVehicle(b)) - Number(isVehicle(a)) || a.name.localeCompare(b.name));
  }, [assets, assetCrew, yardSearch]);

  function loadAssetOnCrew(assetId: string, crewId: string) {
    setAsset.mutate({ assetId, crewId, workDate: date }, { onError: () => toast.error("Couldn't assign equipment") });
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
      op.catch(() => toast.error("Couldn't move that person"));
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
    if (item?.kind === "asset" && item.fromCrewId) {
      clearAsset.mutate({ assetId: item.id, workDate: date }, { onError: () => toast.error("Couldn't unload equipment") });
    }
  }

  if (!permissionsLoading && !can("sched_dispatch_board")) {
    return <EmptyState icon={Users} title="No access" description="You don't have permission to view the Crew Board." />;
  }

  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const big = tv; // scale type up for across-the-room reading

  const body = (
    <div className={cn("flex h-full min-h-0 flex-col gap-3", tv && "p-5")}>
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className={cn("font-semibold text-slate-900 dark:text-neutral-100", big ? "text-4xl" : "text-xl")}>
            Crew Board
          </h1>
          {!tv && (
            <p className="text-sm text-muted-foreground">
              Who is on each crew, what they&apos;re taking, and where they&apos;re going — drag to change
            </p>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className={cn(big ? "h-11 w-11 p-0" : "h-8 w-8 p-0")} onClick={() => setParams({ date: shiftDate(date, -1) })} aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className={cn("min-w-[10ch] text-center font-medium", big ? "text-2xl" : "text-sm")}>{dateLabel}</span>
          <Button size="sm" variant="outline" className={cn(big ? "h-11 w-11 p-0" : "h-8 w-8 p-0")} onClick={() => setParams({ date: shiftDate(date, 1) })} aria-label="Next day">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className={cn(big ? "h-11 text-base" : "h-8 text-xs")} onClick={() => setParams({ date: null })}>
            Today
          </Button>
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

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Equipment yard — everything not loaded on a crew today. Hidden on the TV. */}
        {!tv && (
          <aside
            onDragOver={(e) => { if (drag?.kind === "asset" && drag.fromCrewId) { e.preventDefault(); setOverKey("yard"); } }}
            onDragLeave={() => overKey === "yard" && setOverKey(null)}
            onDrop={(e) => { e.preventDefault(); handleDropOnYard(); }}
            className={cn(
              "flex w-60 shrink-0 flex-col rounded-lg border bg-card",
              overKey === "yard" && "ring-2 ring-brand-400"
            )}
          >
            <div className="border-b px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                <Truck className="h-3.5 w-3.5" /> Equipment yard
              </div>
              <Input
                value={yardSearch}
                onChange={(e) => setYardSearch(e.target.value)}
                placeholder="Search equipment…"
                className="mt-2 h-8 text-xs"
              />
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {yard.length === 0 && <p className="p-2 text-xs text-muted-foreground">Nothing in the yard.</p>}
              {yard.map((a) => (
                <AssetCard
                  key={a.id}
                  asset={a}
                  onDragStart={() => setDrag({ kind: "asset", id: a.id, fromCrewId: null })}
                  onDragEnd={() => { setDrag(null); setOverKey(null); }}
                />
              ))}
            </div>
            <p className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">Drag onto a crew. Drop a loaded item here to unload it.</p>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-1">
          {crews.map((crew) => {
            const members = membersByCrew.get(crew.id) ?? [];
            const loaded = dailyAssets.filter((a) => a.crewId === crew.id).map((a) => assetById.get(a.assetId)).filter((a): a is Asset => !!a);
            loaded.sort((a, b) => Number(isVehicle(b)) - Number(isVehicle(a)) || a.name.localeCompare(b.name));
            const jobs = jobsByCrew.get(crew.id) ?? [];
            const need = neededByCrew.get(crew.id) ?? new Map<string, string[]>();
            const missing = [...need.keys()].filter((id) => assetCrew.get(id) !== crew.id);
            const budget = jobs.reduce((s, j) => s + j.visits.reduce((t, v) => t + (v.budgetedHours ?? 0), 0), 0);
            const key = `crew:${crew.id}`;
            return (
              <section
                key={crew.id}
                onDragOver={(e) => { if (drag) { e.preventDefault(); if (overKey !== key) setOverKey(key); } }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverKey(null); }}
                onDrop={(e) => { e.preventDefault(); handleDropOnCrew(crew.id); }}
                className={cn(
                  "flex shrink-0 flex-col rounded-lg border bg-muted/30",
                  big ? "w-[26rem]" : "w-72",
                  overKey === key && "ring-2 ring-brand-400 bg-brand-50/40 dark:bg-brand-900/20"
                )}
              >
                <header
                  className="flex items-center gap-2 rounded-t-lg border-b px-3 py-2"
                  style={{ borderTop: `4px solid ${crew.color ?? "#94a3b8"}` }}
                >
                  <span className={cn("font-semibold", big ? "text-2xl" : "text-sm")}>{crew.name}</span>
                  <span className={cn("ml-auto flex items-center gap-1 text-muted-foreground", big ? "text-base" : "text-xs")}>
                    <Users className="h-3.5 w-3.5" /> {members.length}
                    <span className="mx-1">·</span>
                    {jobs.length} job{jobs.length === 1 ? "" : "s"}
                    <span className="mx-1">·</span>
                    {formatHours(budget, 1)}h
                  </span>
                </header>

                <div className="flex-1 space-y-3 overflow-y-auto p-2">
                  <Lane title="People" big={big}>
                    {members.length === 0 && <Empty big={big}>No one assigned</Empty>}
                    {members.map((m) => (
                      <div
                        key={m.id}
                        draggable={!tv}
                        onDragStart={() => setDrag({ kind: "member", id: m.id, fromCrewId: crew.id })}
                        onDragEnd={() => { setDrag(null); setOverKey(null); }}
                        className={cn(
                          "flex items-center gap-2 rounded-md border bg-background px-2 py-1 shadow-sm",
                          big ? "text-lg" : "text-xs",
                          !tv && "cursor-grab active:cursor-grabbing"
                        )}
                      >
                        <span className="truncate font-medium">{m.name}</span>
                        {m.isForeman && <span className="rounded bg-slate-200 px-1 text-[10px] font-semibold uppercase dark:bg-neutral-700">Lead</span>}
                        {m.moved && <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-400">today only</span>}
                      </div>
                    ))}
                  </Lane>

                  <Lane title="Equipment" big={big}>
                    {loaded.length === 0 && missing.length === 0 && <Empty big={big}>Nothing loaded</Empty>}
                    {loaded.map((a) => (
                      <AssetCard
                        key={a.id}
                        asset={a}
                        big={big}
                        draggable={!tv}
                        onDragStart={() => setDrag({ kind: "asset", id: a.id, fromCrewId: crew.id })}
                        onDragEnd={() => { setDrag(null); setOverKey(null); }}
                        needed={need.has(a.id)}
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
                            "flex w-full items-center gap-1.5 rounded-md border border-dashed border-amber-500 bg-amber-50 px-2 py-1 text-left text-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
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

                  <Lane title="Jobs" big={big}>
                    {jobs.length === 0 && <Empty big={big}>No jobs scheduled</Empty>}
                    {jobs.map((j) => (
                      <JobCard
                        key={j.jobId}
                        visits={j.visits}
                        big={big}
                        draggable={!tv}
                        onDragStart={() => setDrag({ kind: "job", jobId: j.jobId, visitIds: j.visits.map((v) => v.id), fromCrewId: crew.id })}
                        onDragEnd={() => { setDrag(null); setOverKey(null); }}
                      />
                    ))}
                  </Lane>
                </div>
              </section>
            );
          })}

          {crews.length === 0 && <p className="p-6 text-sm text-muted-foreground">No active crews yet — add them under Team.</p>}

          {(jobsByCrew.get("unassigned")?.length ?? 0) > 0 && (
            <section className={cn("flex shrink-0 flex-col rounded-lg border border-dashed bg-muted/20", big ? "w-[26rem]" : "w-72")}>
              <header className="border-b px-3 py-2">
                <span className={cn("font-semibold", big ? "text-2xl" : "text-sm")}>Unassigned jobs</span>
              </header>
              <div className="space-y-1.5 overflow-y-auto p-2">
                {jobsByCrew.get("unassigned")!.map((j) => (
                  <JobCard
                    key={j.jobId}
                    visits={j.visits}
                    big={big}
                    draggable={!tv}
                    onDragStart={() => setDrag({ kind: "job", jobId: j.jobId, visitIds: j.visits.map((v) => v.id), fromCrewId: null })}
                    onDragEnd={() => { setDrag(null); setOverKey(null); }}
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

function Lane({ title, big, children }: { title: string; big: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className={cn("px-0.5 font-semibold uppercase tracking-wide text-muted-foreground", big ? "text-sm" : "text-[10px]")}>{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Empty({ big, children }: { big: boolean; children: React.ReactNode }) {
  return <p className={cn("px-0.5 text-muted-foreground/70", big ? "text-base" : "text-xs")}>{children}</p>;
}

function AssetCard({
  asset,
  big,
  draggable = true,
  needed,
  onDragStart,
  onDragEnd,
}: {
  asset: Asset;
  big?: boolean;
  draggable?: boolean;
  needed?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", asset.id); onDragStart(); }}
      onDragEnd={onDragEnd}
      className={cn(
        "flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 shadow-sm",
        big ? "text-lg" : "text-xs",
        draggable && "cursor-grab active:cursor-grabbing",
        isVehicle(asset) && "border-l-4 border-l-slate-500"
      )}
    >
      <Truck className={cn("shrink-0 text-muted-foreground", big ? "h-5 w-5" : "h-3.5 w-3.5")} />
      <span className="truncate font-medium">{asset.name}</span>
      {asset.assetTag && <span className="shrink-0 text-muted-foreground">#{asset.assetTag}</span>}
      {needed && <span className="ml-auto shrink-0 rounded bg-emerald-100 px-1 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Job needs</span>}
    </div>
  );
}

function JobCard({
  visits,
  big,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  visits: CRMJobVisit[];
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
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", first.jobId); onDragStart(); }}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-md border bg-background px-2 py-1.5 shadow-sm",
        big ? "text-lg" : "text-xs",
        draggable && "cursor-grab active:cursor-grabbing",
        done && "opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{first.clientName ?? "Client"}</div>
          {services && <div className="truncate text-muted-foreground">{services}</div>}
        </div>
        {budget > 0 && <span className="shrink-0 tabular-nums text-muted-foreground">{formatHours(budget, 1)}h</span>}
      </div>
      {state && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
          <div className={cn("h-full rounded-full", BUDGET_BAR_CLASS[state.level])} style={{ width: `${state.fillPct}%` }} />
        </div>
      )}
    </div>
  );
}
