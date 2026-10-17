"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Maximize2, Minimize2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MultiSelectDropdown } from "@/components/shared/MultiSelectDropdown";
import { SearchInput } from "@/components/shared/SearchInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatHours } from "@/lib/utils";
import { useUpdateVisit, useVisitsForDate } from "@/lib/hooks/use-crm-jobs";
import { useCrews } from "@/lib/hooks/use-employees";
import type { CRMJobVisit } from "@/types/crm-jobs";
import { visitBudgetState } from "./budget-progress";
import { crewColor, textOn } from "./crew-color";

const UNASSIGNED = "unassigned";
const TERMINAL = new Set(["completed", "skipped", "cancelled"]);

type DayMode = "all" | "mon_fri" | "mon_sat";
type HoursMode = "man" | "crew";
type StatusFilter = "all" | "open" | "done";

const DAY_MODE_LABEL: Record<DayMode, string> = {
  all: "All 7 Days",
  mon_fri: "Working Days (Mon–Fri)",
  mon_sat: "Mon–Sat",
};

// Same rule as DispatchBoard's effectiveCrewId (kept local to avoid a
// DispatchBoard <-> DispatchCalendar import cycle): a visit's own crew wins,
// then its job's, and crewUnassigned pins it to no crew.
function effectiveCrewId(v: CRMJobVisit): string | null {
  if (v.crewUnassigned) return null;
  return v.crewId ?? v.job?.crewId ?? null;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday of the week containing `iso` (noon avoids DST edges). */
function mondayOf(iso: string): Date {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable — preference just won't stick */ }
}

interface Row {
  id: string;
  name: string;
  color: string;
  members: { id: string; name: string; isForeman: boolean }[];
}

/**
 * Week calendar modeled on Aspire's schedule: a row per crew (with its roster),
 * a column per day, solid crew-colored cards with an actual-vs-budgeted hours
 * bar, per-cell and per-day totals.
 * Cards drag between cells to reschedule (day) and/or reassign (crew).
 */
export function DispatchCalendar({
  selectedDate,
  onDateChange,
}: {
  selectedDate: string;
  onDateChange: (date: string) => void;
}) {
  const qc = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [dayMode, setDayModeState] = useState<DayMode>("all");
  const [hoursMode, setHoursModeState] = useState<HoursMode>("man");
  const [crewFilter, setCrewFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCell, setOverCell] = useState<string | null>(null);

  // Read saved view prefs after mount (not in the initializer) so SSR and the
  // first client render agree.
  useEffect(() => {
    setDayModeState(readPref<DayMode>("dispatch_cal_days", ["all", "mon_fri", "mon_sat"], "all"));
    setHoursModeState(readPref<HoursMode>("dispatch_cal_hours", ["man", "crew"], "man"));
  }, []);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function setDayMode(v: DayMode) { setDayModeState(v); writePref("dispatch_cal_days", v); }
  function setHoursMode(v: HoursMode) { setHoursModeState(v); writePref("dispatch_cal_hours", v); }
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  }

  const monday = useMemo(() => mondayOf(selectedDate), [selectedDate]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return toISODate(d);
      }),
    [monday]
  );
  const from = weekDays[0];
  const to = weekDays[6];
  const days = useMemo(
    () => weekDays.filter((_, i) => (dayMode === "all" ? true : dayMode === "mon_sat" ? i < 6 : i < 5)),
    [weekDays, dayMode]
  );

  const { data: visits = [], isLoading } = useVisitsForDate(from, to);
  const { data: crews = [] } = useCrews(true);
  const updateVisit = useUpdateVisit();

  const rows: Row[] = useMemo(() => {
    const crewRows = crews.map((c, i) => ({
      id: c.id,
      name: c.name,
      color: crewColor(c.color, i),
      members: (c.members ?? []).map((m) => ({ id: m.id, name: m.employeeName ?? "Member", isForeman: m.isForeman })),
    }));
    return [...crewRows, { id: UNASSIGNED, name: "Unassigned", color: "#64748b", members: [] }];
  }, [crews]);

  const hoursOf = (v: CRMJobVisit, h: number | null | undefined) => {
    const n = h ?? 0;
    return hoursMode === "crew" ? n / Math.max(1, v.menCount || 1) : n;
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visits.filter((v) => {
      if (v.status === "cancelled") return false;
      if (statusFilter === "open" && TERMINAL.has(v.status)) return false;
      if (statusFilter === "done" && v.status !== "completed") return false;
      if (crewFilter.length > 0 && !crewFilter.includes(effectiveCrewId(v) ?? UNASSIGNED)) return false;
      if (q) {
        const hay = `${v.clientName ?? ""} ${(v.serviceNames ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [visits, statusFilter, crewFilter, search]);

  const byCell = useMemo(() => {
    const m = new Map<string, CRMJobVisit[]>();
    for (const v of shown) {
      const key = `${effectiveCrewId(v) ?? UNASSIGNED}|${v.scheduledDate}`;
      const list = m.get(key);
      if (list) list.push(v); else m.set(key, [v]);
    }
    return m;
  }, [shown]);

  const visibleRows = rows.filter((r) => {
    if (crewFilter.length > 0 && !crewFilter.includes(r.id)) return false;
    if (r.id === UNASSIGNED) return days.some((d) => byCell.get(`${r.id}|${d}`)?.length) || !!dragId;
    return true;
  });

  // Day totals across every visible crew (the "Totals:" row).
  const dayTotals = useMemo(
    () =>
      days.map((d) =>
        visibleRows.reduce((sum, r) => sum + (byCell.get(`${r.id}|${d}`) ?? []).reduce((s, v) => s + hoursOf(v, v.budgetedHours), 0), 0)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, visibleRows, byCell, hoursMode]
  );

  function shiftWeek(delta: number) {
    const d = new Date(monday);
    d.setDate(d.getDate() + delta * 7);
    onDateChange(toISODate(d));
  }

  function handleDrop(crewId: string, date: string) {
    const id = dragId;
    setDragId(null);
    setOverCell(null);
    const visit = visits.find((v) => v.id === id);
    if (!visit || TERMINAL.has(visit.status)) return;
    const fromCrew = effectiveCrewId(visit) ?? UNASSIGNED;
    if (fromCrew === crewId && visit.scheduledDate === date) return;

    const toUnassigned = crewId === UNASSIGNED;
    const key = ["crm-job-visits", "date", from, to];
    const previous = qc.getQueryData<CRMJobVisit[]>(key);
    // Optimistic: move the card immediately, roll back if the write fails.
    qc.setQueryData<CRMJobVisit[]>(key, (old) =>
      (old ?? []).map((v) =>
        v.id === visit.id
          ? { ...v, scheduledDate: date, crewId: toUnassigned ? null : crewId, crewUnassigned: toUnassigned }
          : v
      )
    );
    updateVisit.mutate(
      {
        id: visit.id,
        jobId: visit.jobId,
        updates: { scheduled_date: date, crew_id: toUnassigned ? null : crewId, crew_unassigned: toUnassigned },
      },
      {
        onError: () => {
          qc.setQueryData(key, previous);
          toast.error("Couldn't move that visit");
        },
      }
    );
  }

  const today = toISODate(new Date());
  const rangeLabel = `${new Date(`${from}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(`${to}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  // Where the job page's Back button should return to: this week, this view.
  const returnTo = `/crm/scheduling/dispatch?view=calendar&date=${selectedDate}`;
  const gridCols = `190px repeat(${days.length}, minmax(150px, 1fr))`;

  return (
    <div
      ref={rootRef}
      className={cn("flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4", fullscreen && "bg-background p-4")}
    >
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <Labeled label="Crews">
          <MultiSelectDropdown
            className="h-8 w-44 text-xs"
            placeholder="All Crews"
            options={rows.filter((r) => r.id !== UNASSIGNED).map((r) => ({ value: r.id, label: r.name }))}
            selected={crewFilter}
            onChange={setCrewFilter}
          />
        </Labeled>
        <Labeled label="Status">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All</SelectItem>
              <SelectItem value="open" className="text-xs">Open</SelectItem>
              <SelectItem value="done" className="text-xs">Completed</SelectItem>
            </SelectContent>
          </Select>
        </Labeled>
        <Labeled label="Hours">
          <Select value={hoursMode} onValueChange={(v) => setHoursMode(v as HoursMode)}>
            <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="man" className="text-xs">Man</SelectItem>
              <SelectItem value="crew" className="text-xs">Crew</SelectItem>
            </SelectContent>
          </Select>
        </Labeled>
        <Labeled label="Days">
          <Select value={dayMode} onValueChange={(v) => setDayMode(v as DayMode)}>
            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(DAY_MODE_LABEL) as DayMode[]).map((k) => (
                <SelectItem key={k} value={k} className="text-xs">{DAY_MODE_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Labeled>
        <SearchInput value={search} onChange={setSearch} placeholder="Search client or service…" className="w-56" inputClassName="h-8 text-xs" />
        <Button size="sm" variant="outline" className="ml-auto h-8 gap-1 text-xs" onClick={toggleFullscreen}>
          {fullscreen ? <><Minimize2 className="h-3.5 w-3.5" /> Exit full screen</> : <><Maximize2 className="h-3.5 w-3.5" /> Full screen</>}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => shiftWeek(-1)} aria-label="Previous week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => shiftWeek(1)} aria-label="Next week">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onDateChange(today)}>Today</Button>
        <span className="text-sm font-medium">{rangeLabel}</span>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-emerald-400" /> On budget</span>
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-amber-400" /> 90%+</span>
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-red-600" /> Over budget</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <div className="grid min-w-[1100px]" style={{ gridTemplateColumns: gridCols }}>
          <div className="sticky top-0 z-20 border-b bg-card" />
          {days.map((d) => {
            const dt = new Date(`${d}T12:00:00`);
            const isToday = d === today;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onDateChange(d)}
                className="sticky top-0 z-20 border-b border-l bg-card px-2 py-2 text-center"
              >
                <div className={cn("text-[11px] font-medium uppercase text-muted-foreground", isToday && "text-brand-600 dark:text-brand-400")}>
                  {dt.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div className={cn("text-2xl font-light leading-tight", isToday ? "text-brand-600 dark:text-brand-400" : "text-slate-600 dark:text-neutral-300")}>
                  {dt.getDate()}
                </div>
              </button>
            );
          })}

          {visibleRows.map((row) => {
            return (
              <RowCells
                key={row.id}
                row={row}
                days={days}
                today={today}
                byCell={byCell}
                hoursOf={hoursOf}
                returnTo={returnTo}
                dragId={dragId}
                overCell={overCell}
                setDragId={setDragId}
                setOverCell={setOverCell}
                onDrop={handleDrop}
              />
            );
          })}

          {/* Totals row */}
          <div className="sticky bottom-0 z-20 border-t bg-card px-2 py-2 text-right text-xs font-semibold">Totals:</div>
          {dayTotals.map((t, i) => (
            <div key={days[i]} className="sticky bottom-0 z-20 border-l border-t bg-card px-2 py-2 text-right text-sm font-semibold tabular-nums">
              {formatHours(t, 2)}
            </div>
          ))}
        </div>
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function RowCells({
  row,
  days,
  today,
  byCell,
  hoursOf,
  returnTo,
  dragId,
  overCell,
  setDragId,
  setOverCell,
  onDrop,
}: {
  row: Row;
  returnTo: string;
  days: string[];
  today: string;
  byCell: Map<string, CRMJobVisit[]>;
  hoursOf: (v: CRMJobVisit, h: number | null | undefined) => number;
  dragId: string | null;
  overCell: string | null;
  setDragId: (id: string | null) => void;
  setOverCell: (key: string | null) => void;
  onDrop: (crewId: string, date: string) => void;
}) {
  return (
    <>
      <div className="border-b px-3 py-2">
        <div className="text-sm font-semibold" style={{ color: row.color }}>
          {row.name}
          {row.members.length > 0 && <span className="ml-1 font-normal">({row.members.length})</span>}
        </div>
        <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-[11px] leading-tight text-muted-foreground">
          {row.members.map((m) => (
            <li key={m.id} className="truncate">
              {m.name}{m.isForeman ? " · Crew Leader" : ""}
            </li>
          ))}
        </ul>
      </div>
      {days.map((d) => {
        const key = `${row.id}|${d}`;
        const items = byCell.get(key) ?? [];
        const budget = items.reduce((s, v) => s + hoursOf(v, v.budgetedHours), 0);
        return (
          <div
            key={key}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              if (overCell !== key) setOverCell(key);
            }}
            onDragLeave={() => overCell === key && setOverCell(null)}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(row.id, d);
            }}
            className={cn(
              "flex min-h-[110px] flex-col gap-1 border-b border-l p-1",
              d === today && "bg-brand-50/40 dark:bg-brand-900/10",
              overCell === key && "ring-2 ring-inset ring-brand-400"
            )}
          >
            {items.map((v) => (
              <CalendarCard
                key={v.id}
                visit={v}
                color={row.color}
                hoursOf={hoursOf}
                returnTo={returnTo}
                onDragStart={() => setDragId(v.id)}
                onDragEnd={() => { setDragId(null); setOverCell(null); }}
              />
            ))}
            {items.length > 0 && (
              <div className="mt-auto px-0.5 pt-1 text-right text-[11px] tabular-nums text-muted-foreground">
                {formatHours(budget, 2)}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function CalendarCard({
  visit,
  color,
  hoursOf,
  returnTo,
  onDragStart,
  onDragEnd,
}: {
  returnTo: string;
  visit: CRMJobVisit;
  color: string;
  hoursOf: (v: CRMJobVisit, h: number | null | undefined) => number;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const locked = TERMINAL.has(visit.status);
  const fg = textOn(color);
  const services = (visit.serviceNames ?? []).filter(Boolean).join(", ");
  const state = visitBudgetState(visit);
  const done = visit.status === "completed";
  const recurring = visit.job?.jobType === "recurring";
  const budget = hoursOf(visit, visit.budgetedHours);
  const actual = hoursOf(visit, visit.actualHours);
  const barColor = state ? (state.level === "over" ? "#dc2626" : state.level === "warn" ? "#fbbf24" : "#86efac") : "transparent";
  return (
    <div
      draggable={!locked}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", visit.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn("rounded-[3px] px-1.5 py-1 text-[11px] leading-snug shadow-sm", locked ? "opacity-80" : "cursor-grab active:cursor-grabbing")}
      style={{ backgroundColor: color, color: fg }}
      title={`${visit.clientName ?? ""}${services ? ` — ${services}` : ""}\n${formatHours(actual)} of ${formatHours(budget)} hrs`}
    >
      <Link href={`/crm/scheduling/jobs/${visit.jobId}?returnTo=${encodeURIComponent(returnTo)}`} draggable={false} className="flex items-start gap-1 hover:underline">
        {recurring && <Repeat className="mt-0.5 h-3 w-3 shrink-0 opacity-80" />}
        <span className="line-clamp-2 min-w-0">
          {visit.clientName ?? "Client"}
          {services && <> | {services}</>}
        </span>
      </Link>
      <div className="mt-1 flex items-center gap-1.5">
        {done && <Check className="h-3 w-3 shrink-0" />}
        {state && (
          <div className="relative h-3.5 flex-1 overflow-hidden rounded-sm bg-white/90">
            <div className="h-full" style={{ width: `${state.fillPct}%`, backgroundColor: barColor }} />
            <span className="absolute inset-0 flex items-center pl-1 text-[9px] font-medium text-slate-800">
              {Math.round(state.ratio * 100)}%
            </span>
          </div>
        )}
        <span className="ml-auto shrink-0 tabular-nums">{formatHours(budget, 2)}</span>
      </div>
    </div>
  );
}
