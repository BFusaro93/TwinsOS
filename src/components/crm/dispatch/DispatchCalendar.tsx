"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn, formatHours } from "@/lib/utils";
import { useCRMCrews, useUpdateVisit, useVisitsForDate } from "@/lib/hooks/use-crm-jobs";
import type { CRMJobVisit } from "@/types/crm-jobs";
import { visitBudgetState, BUDGET_BAR_CLASS } from "./budget-progress";

const UNASSIGNED = "unassigned";
// Same rule as DispatchBoard's effectiveCrewId (kept local to avoid a
// DispatchBoard <-> DispatchCalendar import cycle): a visit's own crew wins,
// then its job's, and crewUnassigned pins it to no crew.
function effectiveCrewId(v: CRMJobVisit): string | null {
  if (v.crewUnassigned) return null;
  return v.crewId ?? v.job?.crewId ?? null;
}

const TERMINAL = new Set(["completed", "skipped", "cancelled"]);

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

function BudgetBar({ visit }: { visit: CRMJobVisit }) {
  const state = visitBudgetState(visit);
  if (!state) return null;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
      title={`${formatHours(visit.actualHours ?? 0)} of ${formatHours(visit.budgetedHours)} budgeted hrs (${Math.round(state.ratio * 100)}%)`}
    >
      <div className={cn("h-full rounded-full", BUDGET_BAR_CLASS[state.level])} style={{ width: `${state.fillPct}%` }} />
    </div>
  );
}

/**
 * Week calendar: a row per crew, a column per day. Cards are draggable between
 * cells to reschedule (day) and/or reassign (crew). The progress bar on each card
 * is actual vs. budgeted hours — green on budget, amber close, red over.
 */
export function DispatchCalendar({
  selectedDate,
  onDateChange,
}: {
  selectedDate: string;
  onDateChange: (date: string) => void;
}) {
  const qc = useQueryClient();
  const monday = useMemo(() => mondayOf(selectedDate), [selectedDate]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return toISODate(d);
      }),
    [monday]
  );
  const from = days[0];
  const to = days[6];

  const { data: visits = [], isLoading } = useVisitsForDate(from, to);
  const { data: crews = [] } = useCRMCrews();
  const updateVisit = useUpdateVisit();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCell, setOverCell] = useState<string | null>(null);

  const rows = useMemo(
    () => [
      ...crews.map((c) => ({ id: c.id, name: c.name, color: c.color })),
      { id: UNASSIGNED, name: "Unassigned", color: null as string | null },
    ],
    [crews]
  );

  const byCell = useMemo(() => {
    const m = new Map<string, CRMJobVisit[]>();
    for (const v of visits) {
      if (v.status === "cancelled") continue;
      const key = `${effectiveCrewId(v) ?? UNASSIGNED}|${v.scheduledDate}`;
      const list = m.get(key);
      if (list) list.push(v); else m.set(key, [v]);
    }
    return m;
  }, [visits]);

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
        updates: {
          scheduled_date: date,
          crew_id: toUnassigned ? null : crewId,
          crew_unassigned: toUnassigned,
        },
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => shiftWeek(-1)} aria-label="Previous week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => shiftWeek(1)} aria-label="Next week">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onDateChange(today)}>
          Today
        </Button>
        <span className="text-sm font-medium">{rangeLabel}</span>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-emerald-500" /> On budget</span>
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-amber-500" /> Near budget</span>
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-red-500" /> Over budget</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <div
          className="grid min-w-[1100px]"
          style={{ gridTemplateColumns: "150px repeat(7, minmax(150px, 1fr))" }}
        >
          {/* header row */}
          <div className="sticky top-0 z-10 border-b bg-muted/60 px-2 py-2 text-[11px] font-semibold uppercase text-muted-foreground backdrop-blur">
            Crew
          </div>
          {days.map((d) => {
            const dt = new Date(`${d}T12:00:00`);
            return (
              <button
                key={d}
                type="button"
                onClick={() => onDateChange(d)}
                className={cn(
                  "sticky top-0 z-10 border-b border-l bg-muted/60 px-2 py-2 text-left backdrop-blur",
                  d === today && "bg-brand-50 dark:bg-brand-900/30"
                )}
              >
                <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {dt.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div className={cn("text-lg font-semibold leading-tight", d === today && "text-brand-600 dark:text-brand-400")}>
                  {dt.getDate()}
                </div>
              </button>
            );
          })}

          {rows.map((row) => {
            const rowEmpty = days.every((d) => !byCell.get(`${row.id}|${d}`)?.length);
            if (row.id === UNASSIGNED && rowEmpty && !dragId) return null;
            return (
              <RowCells
                key={row.id}
                row={row}
                days={days}
                today={today}
                byCell={byCell}
                dragId={dragId}
                overCell={overCell}
                setDragId={setDragId}
                setOverCell={setOverCell}
                onDrop={handleDrop}
              />
            );
          })}
        </div>
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
      </div>
    </div>
  );
}

function RowCells({
  row,
  days,
  today,
  byCell,
  dragId,
  overCell,
  setDragId,
  setOverCell,
  onDrop,
}: {
  row: { id: string; name: string; color: string | null };
  days: string[];
  today: string;
  byCell: Map<string, CRMJobVisit[]>;
  dragId: string | null;
  overCell: string | null;
  setDragId: (id: string | null) => void;
  setOverCell: (key: string | null) => void;
  onDrop: (crewId: string, date: string) => void;
}) {
  return (
    <>
      <div className="flex items-start gap-1.5 border-b px-2 py-2">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color ?? "#94a3b8" }} />
        <span className="text-xs font-semibold">{row.name}</span>
      </div>
      {days.map((d) => {
        const key = `${row.id}|${d}`;
        const items = byCell.get(key) ?? [];
        const budget = items.reduce((s, v) => s + (v.budgetedHours ?? 0) * 1, 0);
        const actual = items.reduce((s, v) => s + (v.actualHours ?? 0), 0);
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
              "flex min-h-[96px] flex-col gap-1 border-b border-l p-1",
              d === today && "bg-brand-50/40 dark:bg-brand-900/10",
              overCell === key && "bg-brand-100/70 ring-2 ring-inset ring-brand-400 dark:bg-brand-900/30"
            )}
          >
            {items.map((v) => (
              <CalendarCard key={v.id} visit={v} crewColor={row.color} onDragStart={() => setDragId(v.id)} onDragEnd={() => { setDragId(null); setOverCell(null); }} />
            ))}
            {items.length > 0 && (
              <div className="mt-auto flex justify-between px-0.5 pt-1 text-[10px] text-muted-foreground">
                <span>{formatHours(budget, 1)} bud</span>
                <span>{formatHours(actual, 1)} act</span>
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
  crewColor,
  onDragStart,
  onDragEnd,
}: {
  visit: CRMJobVisit;
  crewColor: string | null;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const locked = TERMINAL.has(visit.status);
  const services = (visit.serviceNames ?? []).filter(Boolean).join(", ");
  return (
    <div
      draggable={!locked}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", visit.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex flex-col gap-1 rounded-md border-l-4 bg-background px-1.5 py-1 text-[11px] shadow-sm ring-1 ring-black/5 dark:ring-white/10",
        locked ? "opacity-70" : "cursor-grab active:cursor-grabbing"
      )}
      style={{ borderLeftColor: crewColor ?? "#94a3b8" }}
    >
      <div className="flex items-start gap-1">
        {!locked && <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />}
        <Link
          href={`/crm/scheduling/jobs/${visit.jobId}`}
          draggable={false}
          className="min-w-0 flex-1 hover:underline"
        >
          <div className="truncate font-semibold">{visit.clientName ?? "Client"}</div>
          {services && <div className="truncate text-muted-foreground">{services}</div>}
        </Link>
        {visit.budgetedHours != null && (
          <span className="shrink-0 tabular-nums text-muted-foreground">{formatHours(visit.budgetedHours, 1)}h</span>
        )}
      </div>
      <BudgetBar visit={visit} />
    </div>
  );
}
