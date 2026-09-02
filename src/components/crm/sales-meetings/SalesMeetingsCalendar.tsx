"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Plus, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeekStrip } from "@/components/crm/WeekStrip";
import { useSalesReps, useSalesMeetings, type SalesMeetingWithClient } from "@/lib/hooks/use-sales-meetings";
import type { SalesRepOption } from "@/types/crm-sales-meetings";
import { SalesMeetingDialog } from "./SalesMeetingDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { cn } from "@/lib/utils";

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19;
const PX_PER_HOUR = 56;

type ViewMode = "day" | "week" | "month";

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayLocalString(): string {
  return toLocalDateString(new Date());
}

function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`); // noon avoids DST edge
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function startOfMonthGrid(date: Date): Date {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  return startOfWeek(firstOfMonth);
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-brand-50 border-brand-300 text-brand-800",
  completed: "bg-emerald-50 border-emerald-300 text-emerald-800",
  canceled: "bg-slate-100 border-slate-300 text-slate-500 line-through",
  no_show: "bg-red-50 border-red-300 text-red-700",
};

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export function SalesMeetingsCalendar() {
  const { can, isLoading: permissionsLoading } = usePermissions();
  const canAdd = can("sales_meeting_add");
  const canEdit = can("sales_meeting_edit");
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState(todayLocalString());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<SalesMeetingWithClient | null>(null);
  const [slotDefaults, setSlotDefaults] = useState<{ repId?: string; date?: string; time?: string }>({});

  const { data: reps, isLoading: repsLoading } = useSalesReps();

  const selected = useMemo(() => parseLocalDate(selectedDate), [selectedDate]);

  // Query range covers exactly what the active view renders — a single day,
  // the Sun-Sat week containing selectedDate, or the full 6-week grid a
  // month view displays (including the leading/trailing days from adjacent
  // months that fill out the grid).
  const { rangeStartIso, rangeEndIso } = useMemo(() => {
    if (viewMode === "day") {
      return {
        rangeStartIso: new Date(`${selectedDate}T00:00:00`).toISOString(),
        rangeEndIso: new Date(`${selectedDate}T23:59:59.999`).toISOString(),
      };
    }
    if (viewMode === "week") {
      const start = startOfWeek(selected);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { rangeStartIso: start.toISOString(), rangeEndIso: end.toISOString() };
    }
    const start = startOfMonthGrid(selected);
    const end = new Date(start);
    end.setDate(end.getDate() + 42);
    return { rangeStartIso: start.toISOString(), rangeEndIso: end.toISOString() };
  }, [viewMode, selectedDate, selected]);

  const { data: meetings, isLoading: meetingsLoading } = useSalesMeetings(rangeStartIso, rangeEndIso);

  function openNewMeeting(opts: { repId?: string; date?: string; hour?: number } = {}) {
    if (!canAdd) return;
    setEditingMeeting(null);
    setSlotDefaults({
      repId: opts.repId,
      date: opts.date ?? selectedDate,
      time: opts.hour !== undefined ? `${String(opts.hour).padStart(2, "0")}:00` : undefined,
    });
    setDialogOpen(true);
  }

  function openEditMeeting(meeting: SalesMeetingWithClient) {
    if (!canEdit) return;
    setEditingMeeting(meeting);
    setSlotDefaults({});
    setDialogOpen(true);
  }

  const loading = repsLoading || meetingsLoading;
  const noReps = !reps || reps.length === 0;

  if (!permissionsLoading && !can("sales_meeting_list")) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No access"
        description="You don't have permission to view Sales Meetings."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <WeekStrip selectedDate={selectedDate} onDateChange={setSelectedDate} />
          <div className="flex rounded-lg border bg-white p-0.5 shadow-sm">
            {VIEW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setViewMode(opt.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  viewMode === opt.value ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {canAdd && (
          <Button onClick={() => openNewMeeting()} className="shrink-0 gap-1.5">
            <Plus className="h-4 w-4" />
            Book Meeting
          </Button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading calendar…</div>
      ) : noReps ? (
        <div className="rounded-lg border bg-white py-16 text-center text-sm text-slate-500">
          No sales reps configured. Mark an employee as a sales rep in{" "}
          <span className="font-medium">Team → Employees</span> to see them here.
        </div>
      ) : viewMode === "day" ? (
        <DayView
          reps={reps!}
          meetings={meetings ?? []}
          onSlotClick={(repId, hour) => openNewMeeting({ repId, hour })}
          onMeetingClick={openEditMeeting}
        />
      ) : viewMode === "week" ? (
        <WeekView
          reps={reps!}
          meetings={meetings ?? []}
          weekStart={startOfWeek(selected)}
          onSlotClick={(repId, date) => openNewMeeting({ repId, date })}
          onMeetingClick={openEditMeeting}
        />
      ) : (
        <MonthView
          meetings={meetings ?? []}
          monthAnchor={selected}
          onDayClick={(date) => { setSelectedDate(date); setViewMode("day"); }}
          onMeetingClick={openEditMeeting}
        />
      )}

      <SalesMeetingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        meeting={editingMeeting}
        defaultSalesRepId={slotDefaults.repId}
        defaultDate={slotDefaults.date ?? selectedDate}
        defaultTime={slotDefaults.time}
      />
    </div>
  );
}

// ── Day view ────────────────────────────────────────────────────────────────

function DayView({
  reps,
  meetings,
  onSlotClick,
  onMeetingClick,
}: {
  reps: SalesRepOption[];
  meetings: SalesMeetingWithClient[];
  onSlotClick: (repId: string, hour: number) => void;
  onMeetingClick: (meeting: SalesMeetingWithClient) => void;
}) {
  const hours = useMemo(
    () => Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i),
    []
  );

  const meetingsByRep = useMemo(() => {
    const map = new Map<string, SalesMeetingWithClient[]>();
    for (const m of meetings) {
      const list = map.get(m.salesRepId) ?? [];
      list.push(m);
      map.set(m.salesRepId, list);
    }
    return map;
  }, [meetings]);

  function positionFor(meeting: SalesMeetingWithClient) {
    const start = new Date(meeting.scheduledAt);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const top = Math.max(0, (startHour - DAY_START_HOUR) * PX_PER_HOUR);
    const height = Math.max(24, (meeting.durationMinutes / 60) * PX_PER_HOUR - 2);
    return { top, height };
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <div className="flex min-w-[720px]">
        <div className="w-16 shrink-0 border-r bg-slate-50">
          <div className="h-10 border-b" />
          {hours.map((h) => (
            <div key={h} style={{ height: PX_PER_HOUR }} className="border-b px-2 pt-0.5 text-right text-[11px] text-slate-400">
              {h % 12 === 0 ? 12 : h % 12}{h < 12 ? "am" : "pm"}
            </div>
          ))}
        </div>

        {reps.map((rep) => (
          <div key={rep.id} className="relative flex-1 min-w-[180px] border-r last:border-r-0">
            <div className="flex h-10 items-center gap-1.5 border-b px-2 text-xs font-semibold text-slate-700">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: rep.mapIconColor ?? "#94a3b8" }} />
              {rep.name}
            </div>
            <div className="relative">
              {hours.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onSlotClick(rep.id, h)}
                  style={{ height: PX_PER_HOUR }}
                  className="block w-full border-b border-dashed border-slate-100 hover:bg-brand-50/40"
                />
              ))}

              {(meetingsByRep.get(rep.id) ?? []).map((m) => {
                const { top, height } = positionFor(m);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onMeetingClick(m)}
                    style={{ top, height }}
                    className={cn(
                      "absolute left-1 right-1 overflow-hidden rounded border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm",
                      STATUS_STYLES[m.status] ?? STATUS_STYLES.scheduled
                    )}
                  >
                    <div className="truncate font-medium">{m.title}</div>
                    <div className="truncate opacity-80">{m.clientName ?? m.leadName ?? "New lead"}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Week view ───────────────────────────────────────────────────────────────

const DAY_LETTERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function WeekView({
  reps,
  meetings,
  weekStart,
  onSlotClick,
  onMeetingClick,
}: {
  reps: SalesRepOption[];
  meetings: SalesMeetingWithClient[];
  weekStart: Date;
  onSlotClick: (repId: string, date: string) => void;
  onMeetingClick: (meeting: SalesMeetingWithClient) => void;
}) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }),
    [weekStart]
  );
  const today = todayLocalString();

  const meetingsByRepAndDay = useMemo(() => {
    const map = new Map<string, SalesMeetingWithClient[]>();
    for (const m of meetings) {
      const dateKey = toLocalDateString(new Date(m.scheduledAt));
      const key = `${m.salesRepId}|${dateKey}`;
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    }
    return map;
  }, [meetings]);

  return (
    <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
      <div className="grid min-w-[900px]" style={{ gridTemplateColumns: `140px repeat(7, 1fr)` }}>
        <div className="border-b border-r bg-slate-50" />
        {days.map((d, i) => {
          const ds = toLocalDateString(d);
          return (
            <div
              key={i}
              className={cn(
                "border-b border-r px-2 py-2 text-center text-xs font-semibold last:border-r-0",
                ds === today ? "bg-brand-50 text-brand-700" : "text-slate-700"
              )}
            >
              {DAY_LETTERS[i]} {d.getDate()}
            </div>
          );
        })}

        {reps.map((rep) => (
          <FragmentRow key={rep.id}>
            <div className="flex items-center gap-1.5 border-b border-r bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: rep.mapIconColor ?? "#94a3b8" }} />
              {rep.name}
            </div>
            {days.map((d, i) => {
              const ds = toLocalDateString(d);
              const cellMeetings = meetingsByRepAndDay.get(`${rep.id}|${ds}`) ?? [];
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSlotClick(rep.id, ds)}
                  className="flex min-h-[72px] flex-col gap-1 border-b border-r p-1.5 text-left last:border-r-0 hover:bg-brand-50/30"
                >
                  {cellMeetings.map((m) => (
                    <span
                      key={m.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onMeetingClick(m); }}
                      className={cn(
                        "truncate rounded border px-1.5 py-0.5 text-[11px] leading-tight shadow-sm",
                        STATUS_STYLES[m.status] ?? STATUS_STYLES.scheduled
                      )}
                    >
                      {new Date(m.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · {m.clientName ?? m.leadName ?? m.title}
                    </span>
                  ))}
                </button>
              );
            })}
          </FragmentRow>
        ))}
      </div>
    </div>
  );
}

// Small helper so each rep's row of grid cells can be returned as a flat
// list of children (CSS grid needs the row's cells as direct grid children,
// not wrapped in an extra element) without importing React.Fragment noise
// at every call site.
function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// ── Month view ──────────────────────────────────────────────────────────────

function MonthView({
  meetings,
  monthAnchor,
  onDayClick,
  onMeetingClick,
}: {
  meetings: SalesMeetingWithClient[];
  monthAnchor: Date;
  onDayClick: (date: string) => void;
  onMeetingClick: (meeting: SalesMeetingWithClient) => void;
}) {
  const gridStart = useMemo(() => startOfMonthGrid(monthAnchor), [monthAnchor]);
  const today = todayLocalString();
  const currentMonth = monthAnchor.getMonth();

  const days = useMemo(
    () => Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    }),
    [gridStart]
  );

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, SalesMeetingWithClient[]>();
    for (const m of meetings) {
      const dateKey = toLocalDateString(new Date(m.scheduledAt));
      const list = map.get(dateKey) ?? [];
      list.push(m);
      map.set(dateKey, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    }
    return map;
  }, [meetings]);

  const MAX_VISIBLE = 3;

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b bg-slate-50">
        {DAY_LETTERS.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-xs font-semibold text-slate-500">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const ds = toLocalDateString(d);
          const inMonth = d.getMonth() === currentMonth;
          const dayMeetings = meetingsByDay.get(ds) ?? [];
          const visible = dayMeetings.slice(0, MAX_VISIBLE);
          const overflow = dayMeetings.length - visible.length;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onDayClick(ds)}
              className={cn(
                "flex min-h-[100px] flex-col gap-1 border-b border-r p-1.5 text-left last:border-r-0",
                inMonth ? "bg-white hover:bg-brand-50/30" : "bg-slate-50/60 text-slate-400 hover:bg-slate-100/60",
                (i + 1) % 7 === 0 && "border-r-0"
              )}
            >
              <span className={cn("text-xs font-medium", ds === today && "flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white")}>
                {d.getDate()}
              </span>
              {visible.map((m) => (
                <span
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onMeetingClick(m); }}
                  className={cn(
                    "truncate rounded border px-1 py-0.5 text-[10px] leading-tight shadow-sm",
                    STATUS_STYLES[m.status] ?? STATUS_STYLES.scheduled
                  )}
                >
                  {m.clientName ?? m.leadName ?? m.title}
                </span>
              ))}
              {overflow > 0 && (
                <span className="text-[10px] font-medium text-slate-400">+{overflow} more</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
