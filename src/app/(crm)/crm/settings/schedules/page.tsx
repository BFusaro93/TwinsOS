"use client";

import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ScheduleNameTakenError, useAllCRMSchedules, useCreateCRMSchedule, useUpdateCRMSchedule, useDeleteCRMSchedule, useBulkImportCRMSchedules } from "@/lib/hooks/use-crm-jobs";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import type { CRMSchedule } from "@/types/crm-jobs";
import { Button } from "@/components/ui/button";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { toast } from "sonner";
import { useConfirm } from "@/components/shared/useConfirm";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { ruleFromScheduleRow, scheduleOccurrences } from "@/lib/visits/recurrence";

// ── constants ─────────────────────────────────────────────────────────────────

const FREQUENCY_LABELS: Record<CRMSchedule['frequency'], string> = {
  weekly:        'Weekly',
  bi_weekly:     'Bi-Weekly',
  every_3_weeks: 'Every 3 Weeks',
  every_4_weeks: 'Every 4 Weeks',
  monthly:       'Monthly',
  custom:        'Custom dates',
};

const DAY_OPTIONS: CRMSchedule['dayOfWeek'][] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type WeekOfMonth = NonNullable<CRMSchedule['weekOfMonth']>;
const WEEK_OF_MONTH_OPTIONS: WeekOfMonth[] = ['first', 'second', 'third', 'fourth', 'last'];
const WEEK_OF_MONTH_LABELS: Record<WeekOfMonth, string> = {
  first: '1st', second: '2nd', third: '3rd', fourth: '4th', last: 'Last',
};
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── schedule date calculator ──────────────────────────────────────────────────

/**
 * Upcoming dates for a schedule — the SAME function the visit generators use
 * (src/lib/visits/recurrence.ts), so what this preview shows is what the
 * cron / "Generate Visits" will actually schedule. Returned as local-midnight
 * Dates for display only.
 */
function computeUpcomingDates(sched: CRMSchedule, count = 20): Date[] {
  const rule = ruleFromScheduleRow({
    name: sched.name,
    frequency: sched.frequency,
    day_of_week: sched.dayOfWeek,
    week_pattern: sched.weekPattern ?? null,
    anchor_date: sched.anchorDate ?? null,
    week_of_month: sched.weekOfMonth ?? null,
    season_start: sched.seasonStart ?? null,
    season_end: sched.seasonEnd ?? null,
    custom_dates: sched.customDates ?? null,
    excluded_dates: sched.excludedDates ?? null,
  });
  if (!rule) return [];
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return scheduleOccurrences(rule, today, null, { limit: count }).map((d) => new Date(`${d}T00:00:00`));
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// ── MonthDayPicker ────────────────────────────────────────────────────────────

function MonthDayPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const parts = value ? value.split('-') : ['', ''];
  const [localMonth, setLocalMonth] = useState(parts[0] ?? '');
  const [localDay, setLocalDay] = useState(parts[1] ?? '');

  // Sync local state when external value resets (dialog open/close)
  useEffect(() => {
    const p = value ? value.split('-') : ['', ''];
    setLocalMonth(p[0] ?? '');
    setLocalDay(p[1] ?? '');
  }, [value]);

  function handleMonthChange(m: string) {
    setLocalMonth(m);
    if (m && localDay) onChange(`${m}-${localDay}`);
    else onChange('');
  }

  function handleDayChange(d: string) {
    setLocalDay(d);
    if (localMonth && d) onChange(`${localMonth}-${d}`);
    else onChange('');
  }

  const daysInMonth = localMonth ? new Date(2024, parseInt(localMonth), 0).getDate() : 31;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {(localMonth || localDay) && (
          <button
            type="button"
            onClick={() => { setLocalMonth(''); setLocalDay(''); onChange(''); }}
            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-slate-700 dark:hover:text-neutral-300"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <Select value={localMonth} onValueChange={handleMonthChange}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={i} value={String(i + 1).padStart(2, '0')}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={localDay} onValueChange={handleDayChange}>
          <SelectTrigger className="w-20"><SelectValue placeholder="Day" /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
              <SelectItem key={d} value={String(d).padStart(2, '0')}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ── CustomDatePicker ──────────────────────────────────────────────────────────

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Month grid where each click toggles a date on/off — for hand-picked service dates. */
function CustomDatePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [cursor, setCursor] = useState(() => {
    const first = [...value].sort()[0];
    const base = first ? new Date(`${first}T00:00:00`) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const selected = useMemo(() => new Set(value), [value]);

  const firstDow = new Date(cursor.year, cursor.month, 1).getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    ),
  ];

  function toggle(ymd: string) {
    const next = new Set(selected);
    if (next.has(ymd)) next.delete(ymd); else next.add(ymd);
    onChange([...next].sort());
  }
  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => shift(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{MONTHS[cursor.month]} {cursor.year}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => shift(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground">
        {WEEKDAY_HEADERS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((ymd, i) =>
          ymd ? (
            <button
              key={ymd}
              type="button"
              onClick={() => toggle(ymd)}
              className={`h-8 rounded text-xs transition-colors ${
                selected.has(ymd)
                  ? 'bg-brand-600 text-white font-semibold hover:bg-brand-700'
                  : 'hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-neutral-300'
              }`}
            >
              {Number(ymd.slice(8))}
            </button>
          ) : (
            <span key={`b${i}`} />
          )
        )}
      </div>
      <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
        <span>{value.length} date{value.length !== 1 ? 's' : ''} selected — click a selected date to remove it</span>
        {value.length > 0 && (
          <button type="button" className="hover:text-slate-700 dark:hover:text-neutral-300" onClick={() => onChange([])}>
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Month calendar for the dates a recurring schedule lands on; click one to skip it (turns red),
 * click again to restore it. Lets you drop a single holiday Monday without breaking the weekly rule.
 */
function SkipDatesPicker({
  schedule,
  value,
  onChange,
}: {
  schedule: CRMSchedule;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const skipped = useMemo(() => new Set(value), [value]);

  const pad = (n: number) => String(n).padStart(2, '0');
  const monthStart = `${cursor.year}-${pad(cursor.month + 1)}-01`;
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const monthEnd = `${cursor.year}-${pad(cursor.month + 1)}-${pad(daysInMonth)}`;

  // Occurrences with NOTHING skipped, so skipped days stay visible (as red) and can be restored.
  const scheduled = useMemo(() => {
    const rule = ruleFromScheduleRow({
      name: schedule.name,
      frequency: schedule.frequency,
      day_of_week: schedule.dayOfWeek,
      week_pattern: schedule.weekPattern ?? null,
      anchor_date: schedule.anchorDate ?? null,
      week_of_month: schedule.weekOfMonth ?? null,
      season_start: schedule.seasonStart ?? null,
      season_end: schedule.seasonEnd ?? null,
    });
    return new Set(rule ? scheduleOccurrences(rule, monthStart, monthEnd) : []);
  }, [schedule.frequency, schedule.dayOfWeek, schedule.weekPattern, schedule.anchorDate, schedule.weekOfMonth, schedule.seasonStart, schedule.seasonEnd, schedule.name, monthStart, monthEnd]);

  const firstDow = new Date(cursor.year, cursor.month, 1).getDay();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${cursor.year}-${pad(cursor.month + 1)}-${pad(i + 1)}`),
  ];

  function toggle(ymd: string) {
    const next = new Set(skipped);
    if (next.has(ymd)) next.delete(ymd); else next.add(ymd);
    onChange([...next].sort());
  }
  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-xs font-semibold text-slate-600 dark:text-neutral-400">
        Skip Dates <span className="font-normal text-slate-400 dark:text-neutral-500">(optional)</span>
      </p>
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => shift(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{MONTHS[cursor.month]} {cursor.year}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => shift(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground">
        {WEEKDAY_HEADERS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((ymd, i) => {
          if (!ymd) return <span key={`b${i}`} />;
          const day = Number(ymd.slice(8));
          const isSkipped = skipped.has(ymd);
          if (!scheduled.has(ymd) && !isSkipped) {
            return <span key={ymd} className="flex h-8 items-center justify-center text-xs text-slate-300 dark:text-neutral-700">{day}</span>;
          }
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => toggle(ymd)}
              title={isSkipped ? 'Skipped — click to restore' : 'Scheduled — click to skip'}
              className={`h-8 rounded text-xs font-semibold transition-colors ${
                isSkipped
                  ? 'bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 line-through hover:bg-red-200 dark:hover:bg-red-950'
                  : 'bg-brand-600 text-white hover:bg-brand-700'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {value.length > 0 ? `${value.length} date${value.length !== 1 ? 's' : ''} skipped. ` : ''}
        Click a green date to skip it; click a red one to restore it. Visits already created for a skipped date aren&rsquo;t removed.
      </p>
    </div>
  );
}

// ── ScheduleDialog ────────────────────────────────────────────────────────────

interface ScheduleFormValues {
  name: string;
  frequency: CRMSchedule['frequency'];
  dayOfWeek: CRMSchedule['dayOfWeek'];
  weekPattern: CRMSchedule['weekPattern'];
  anchorDate: string;
  seasonStart: string;
  seasonEnd: string;
  weekOfMonth: CRMSchedule['weekOfMonth'];
  customDates: string[];
  excludedDates: string[];
}

function defaultForm(): ScheduleFormValues {
  return { name: '', frequency: 'weekly', dayOfWeek: 'Mon', weekPattern: null, anchorDate: '', seasonStart: '', seasonEnd: '', weekOfMonth: null, customDates: [], excludedDates: [] };
}

function scheduleToForm(s: CRMSchedule): ScheduleFormValues {
  return {
    name: s.name,
    frequency: s.frequency,
    dayOfWeek: s.dayOfWeek,
    weekPattern: s.weekPattern,
    anchorDate: s.anchorDate ?? '',
    seasonStart: s.seasonStart ?? '',
    seasonEnd: s.seasonEnd ?? '',
    weekOfMonth: s.weekOfMonth ?? 'first',
    customDates: s.customDates ?? [],
    excludedDates: s.excludedDates ?? [],
  };
}

interface ScheduleDialogProps {
  open: boolean;
  schedule: CRMSchedule | null;
  onClose: () => void;
}

function ScheduleDialog({ open, schedule, onClose }: ScheduleDialogProps) {
  const [form, setForm] = useState<ScheduleFormValues>(defaultForm);
  const createSchedule = useCreateCRMSchedule();
  const updateSchedule = useUpdateCRMSchedule();
  const [confirm, confirmDialog] = useConfirm();
  const qc = useQueryClient();
  const { data: orgSettings } = useOrgSettings();
  const brandColor = orgSettings?.brandColor ?? "#1e293b";

  // Populate form whenever the dialog opens or the schedule prop changes
  useEffect(() => {
    if (open) {
      setForm(schedule ? scheduleToForm(schedule) : defaultForm());
    }
  }, [open, schedule]);

  function setField<K extends keyof ScheduleFormValues>(key: K, value: ScheduleFormValues[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'frequency' && value !== 'bi_weekly') {
        next.weekPattern = null;
        next.anchorDate = '';
      }
      if (key === 'frequency' && value === 'monthly' && !next.weekOfMonth) {
        next.weekOfMonth = 'first';
      }
      if (key === 'weekPattern' && (value === 'any' || value === null)) {
        next.anchorDate = '';
      }
      return next;
    });
  }

  /** Asks (with the count computed first) before replacing upcoming visits on the edited schedule. */
  async function offerReschedule(scheduleId: string) {
    try {
      const post = async (action: 'preview' | 'apply') => {
        const res = await fetch(`/api/crm/schedules/${scheduleId}/reschedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const out = await res.json().catch(() => ({})) as { count?: number; generated?: number; error?: string };
        if (!res.ok) throw new Error(out.error ?? 'Failed to check upcoming visits');
        return out;
      };
      const { count = 0 } = await post('preview');
      if (count === 0) return;
      const ok = await confirm({
        title: `Reschedule ${count} upcoming visit${count !== 1 ? 's' : ''} on this schedule?`,
        description: `${count} upcoming visit${count !== 1 ? 's' : ''} that haven't been dispatched, started, moved by hand or invoiced will be removed and regenerated on the new schedule. Choose "Keep existing visits" to leave them where they are; new visits will still follow the new schedule.`,
        confirmLabel: 'Reschedule visits',
        cancelLabel: 'Keep existing visits',
      });
      if (!ok) return;
      const out = await post('apply');
      toast.success(`Visits rescheduled: ${count} replaced, ${out.generated ?? 0} scheduled`);
      await qc.invalidateQueries({ queryKey: ['crm-job-visits'] });
    } catch (e) {
      toast.error(e instanceof Error ? `Schedule saved, but upcoming visits weren't rescheduled: ${e.message}` : 'Schedule saved, but upcoming visits weren\'t rescheduled');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      frequency: form.frequency,
      dayOfWeek: form.dayOfWeek,
      weekPattern: form.weekPattern,
      anchorDate: form.anchorDate || null,
      seasonStart: form.seasonStart || null,
      seasonEnd: form.seasonEnd || null,
      weekOfMonth: form.frequency === 'monthly' ? (form.weekOfMonth ?? 'first') : null,
      customDates: form.frequency === 'custom' ? form.customDates : [],
      excludedDates: form.frequency === 'custom' ? [] : form.excludedDates,
    };
    if (form.frequency === 'custom' && form.customDates.length === 0) {
      toast.error('Pick at least one date on the calendar');
      return;
    }
    try {
      if (schedule) {
        await updateSchedule.mutateAsync({ id: schedule.id, patch: payload });
        // Day / frequency / holidays changed: the visits already generated
        // follow the OLD rules. Offer to move the upcoming untouched ones.
        const before = scheduleToForm(schedule);
        const rulesChanged =
          schedule.isActive &&
          (payload.frequency !== before.frequency ||
            payload.dayOfWeek !== before.dayOfWeek ||
            payload.weekPattern !== before.weekPattern ||
            (payload.anchorDate ?? '') !== before.anchorDate ||
            (payload.seasonStart ?? '') !== before.seasonStart ||
            (payload.seasonEnd ?? '') !== before.seasonEnd ||
            (payload.weekOfMonth ?? 'first') !== before.weekOfMonth ||
            JSON.stringify(payload.customDates) !== JSON.stringify(before.customDates) ||
            JSON.stringify(payload.excludedDates) !== JSON.stringify(before.excludedDates));
        if (rulesChanged) await offerReschedule(schedule.id);
      } else {
        await createSchedule.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof ScheduleNameTakenError ? err.message : schedule ? "Failed to update schedule" : "Failed to create schedule");
    }
  }

  const isBiWeekly = form.frequency === 'bi_weekly';
  const isMonthly = form.frequency === 'monthly';
  const isCustom = form.frequency === 'custom';
  const showAnchor = isBiWeekly && (form.weekPattern === 'even' || form.weekPattern === 'odd');
  const isPending = createSchedule.isPending || updateSchedule.isPending;

  // Live preview from current form values
  const previewSched: CRMSchedule = {
    id: '', orgId: '', name: form.name, isActive: true,
    frequency: form.frequency, dayOfWeek: form.dayOfWeek,
    weekPattern: form.weekPattern, anchorDate: form.anchorDate || null,
    seasonStart: form.seasonStart || null, seasonEnd: form.seasonEnd || null,
    weekOfMonth: form.weekOfMonth,
    customDates: form.customDates,
    excludedDates: form.excludedDates,
  };
  const previewDates = useMemo(() => computeUpcomingDates(previewSched, 12), [form]);

  return (
    <>
    {confirmDialog}
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 max-h-[85vh] flex flex-col sm:p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{schedule ? 'Edit Schedule' : 'Add Schedule'}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="shrink-0 border-b bg-card rounded-none justify-start px-4 py-0 h-10 gap-0">
            {[
              { value: 'details', label: 'Schedule' },
              // Nothing to show until the schedule exists.
              ...(schedule ? [{ value: 'audit', label: 'Audit Trail' }] : []),
            ].map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="h-full rounded-none border-b-2 border-transparent px-3 py-0 text-sm data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <TabsContent value="details" className="mt-0">
              <div className="flex flex-col md:flex-row gap-5 pt-2">
                {/* Left: form */}
                <form onSubmit={handleSubmit} className="flex-1 space-y-4">
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="e.g. Every Other Monday" required />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Frequency</Label>
                      <Select value={form.frequency} onValueChange={(v) => setField('frequency', v as CRMSchedule['frequency'])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(FREQUENCY_LABELS) as CRMSchedule['frequency'][]).map((f) => (
                            <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {!isCustom && <div className="space-y-1.5">
                      <Label>Day of Week</Label>
                      <Select value={form.dayOfWeek} onValueChange={(v) => setField('dayOfWeek', v as CRMSchedule['dayOfWeek'])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DAY_OPTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>}
                  </div>

                  {isCustom && <CustomDatePicker value={form.customDates} onChange={(v) => setField('customDates', v)} />}

                  {isMonthly && (
                    <div className="space-y-1.5">
                      <Label>Which Week</Label>
                      <Select value={form.weekOfMonth ?? 'first'} onValueChange={(v) => setField('weekOfMonth', v as CRMSchedule['weekOfMonth'])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WEEK_OF_MONTH_OPTIONS.map((w) => (
                            <SelectItem key={w} value={w}>{WEEK_OF_MONTH_LABELS[w]} {form.dayOfWeek}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">E.g. &ldquo;1st Monday&rdquo; of every month.</p>
                    </div>
                  )}

                  {isBiWeekly && (
                    <div className="space-y-1.5">
                      <Label>Week Pattern</Label>
                      <Select value={form.weekPattern ?? 'none'} onValueChange={(v) => setField('weekPattern', (v === 'none' ? null : v) as CRMSchedule['weekPattern'])}>
                        <SelectTrigger><SelectValue placeholder="Select pattern…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Any week</SelectItem>
                          <SelectItem value="even">Even Weeks</SelectItem>
                          <SelectItem value="odd">Odd Weeks</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {showAnchor && (
                    <div className="space-y-1.5">
                      <Label>Anchor Date <span className="text-slate-400 dark:text-neutral-500 font-normal">(optional)</span></Label>
                      <Input type="date" value={form.anchorDate} onChange={(e) => setField('anchorDate', e.target.value)} />
                      <p className="text-xs text-muted-foreground">A known service date used to determine even/odd week alignment.</p>
                      {(() => {
                        // Weeks are counted from the anchor's own weekday, so an anchor on a different
                        // day than the schedule's runs the series a week off from the date entered.
                        const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
                        const anchorDay = form.anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(form.anchorDate)
                          ? names[new Date(`${form.anchorDate}T00:00:00Z`).getUTCDay()]
                          : null;
                        return anchorDay && anchorDay !== form.dayOfWeek ? (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            This date is a {anchorDay}, but the schedule runs on {form.dayOfWeek}. Pick an anchor date that falls on {form.dayOfWeek}, or visits will line up a week off from what you expect.
                          </p>
                        ) : null;
                      })()}
                    </div>
                  )}

                  {!isCustom && (
                    <SkipDatesPicker schedule={previewSched} value={form.excludedDates} onChange={(v) => setField('excludedDates', v)} />
                  )}

                  {/* Season window */}
                  {!isCustom && <div className="rounded-lg border p-3 space-y-3">
                    <p className="text-xs font-semibold text-slate-600 dark:text-neutral-400">Season Window <span className="font-normal text-slate-400 dark:text-neutral-500">(optional)</span></p>
                    <div className="grid grid-cols-2 gap-3">
                      <MonthDayPicker label="Season Start" value={form.seasonStart} onChange={(v) => setField('seasonStart', v)} />
                      <MonthDayPicker label="Season End" value={form.seasonEnd} onChange={(v) => setField('seasonEnd', v)} />
                    </div>
                    <p className="text-xs text-slate-400 dark:text-neutral-500">E.g. April 1 – November 30 for mowing season. Leave blank for year-round.</p>
                  </div>}

                  <DialogFooter className="pt-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
                    <Button type="submit" disabled={isPending || !form.name.trim()}>
                      {isPending ? 'Saving…' : schedule ? 'Save Changes' : 'Add Schedule'}
                    </Button>
                  </DialogFooter>
                </form>

                {/* Right: date preview */}
                <div className="w-full md:w-52 md:shrink-0 flex flex-col rounded-lg border overflow-hidden self-start">
                  <div className="text-white text-xs font-semibold px-3 py-2 flex items-center gap-1.5" style={{ backgroundColor: brandColor }}>
                    <CalendarDays className="h-3.5 w-3.5" /> Upcoming Dates
                  </div>
                  <div className="divide-y text-xs max-h-80 overflow-y-auto">
                    {previewDates.length === 0 ? (
                      <p className="px-3 py-4 text-slate-400 dark:text-neutral-500 text-center">No dates in season</p>
                    ) : (
                      previewDates.map((d, i) => (
                        <div key={i} className="px-3 py-1.5 text-slate-700 dark:text-neutral-300">{formatDate(d)}</div>
                      ))
                    )}
                  </div>
                  <div className="border-t bg-slate-50 dark:bg-muted/40 px-3 py-1.5 text-[10px] text-slate-400 dark:text-neutral-500">
                    Next {previewDates.length} occurrences
                  </div>
                </div>
              </div>
            </TabsContent>

            {schedule && (
              <TabsContent value="audit" className="mt-0">
                <AuditTrailTab recordType="schedule" recordId={schedule.id} />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function SchedulePreviewPopover({ schedule }: { schedule: CRMSchedule }) {
  const dates = useMemo(() => computeUpcomingDates(schedule, 12), [schedule]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-brand-600 dark:hover:text-brand-400">
          <CalendarDays className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="end">
        <div className="bg-slate-800 text-white text-xs font-semibold px-3 py-2">
          Next {dates.length} dates
        </div>
        <div className="divide-y max-h-64 overflow-y-auto">
          {dates.length === 0 ? (
            <p className="px-3 py-4 text-slate-400 dark:text-neutral-500 text-center text-xs">No dates in season</p>
          ) : (
            dates.map((d, i) => (
              <div key={i} className="px-3 py-1.5 text-xs text-slate-700 dark:text-neutral-300">{formatDate(d)}</div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function SchedulesPage() {
  const { data: schedules = [], isLoading } = useAllCRMSchedules();
  const updateSchedule = useUpdateCRMSchedule();
  const deleteSchedule = useDeleteCRMSchedule();
  const { mutateAsync: bulkImportSchedules } = useBulkImportCRMSchedules();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CRMSchedule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CRMSchedule | null>(null);

  function openAdd() { setEditing(null); setDialogOpen(true); }
  function openEdit(s: CRMSchedule) { setEditing(s); setDialogOpen(true); }
  function handleClose() { setDialogOpen(false); setEditing(null); }

  async function handleToggleActive(s: CRMSchedule) {
    try {
      await updateSchedule.mutateAsync({ id: s.id, patch: { isActive: !s.isActive } });
    } catch {
      toast.error("Failed to update schedule");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteSchedule.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete schedule");
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-neutral-100">Schedules</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure recurring service schedule templates — frequency, day, week pattern, and season window.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        <span className="text-sm text-muted-foreground">{schedules.length} schedule{schedules.length !== 1 ? 's' : ''}</span>
        <div className="flex flex-wrap items-center gap-2">
          <ImportExportMenu
            entityLabel="Schedules"
            templateColumns={["name", "frequency", "dayOfWeek", "weekPattern", "anchorDate", "seasonStart", "seasonEnd", "weekOfMonth", "customDates", "excludedDates"]}
            templateFilename="schedules-template.csv"
            requiredColumns={["name", "frequency"]}
            onExport={() =>
              exportCSV(
                schedules.map((s) => ({
                  name: s.name,
                  frequency: s.frequency,
                  dayOfWeek: s.dayOfWeek,
                  weekPattern: s.weekPattern ?? "",
                  anchorDate: s.anchorDate ?? "",
                  seasonStart: s.seasonStart ?? "",
                  seasonEnd: s.seasonEnd ?? "",
                  weekOfMonth: s.weekOfMonth ?? "",
                  customDates: (s.customDates ?? []).join(" | "),
                  excludedDates: (s.excludedDates ?? []).join(" | "),
                })),
                "schedules-export.csv"
              )
            }
            onImport={async (rows) => {
              const { created, skipped } = await bulkImportSchedules(rows);
              if (skipped > 0) {
                toast.warning(`Imported ${created} schedule${created !== 1 ? "s" : ""}. ${skipped} row${skipped !== 1 ? "s" : ""} skipped (invalid or missing name/frequency/day).`);
              } else {
                toast.success(`Successfully imported ${created} schedule${created !== 1 ? "s" : ""}.`);
              }
            }}
          />
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Schedule
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-muted/40 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-neutral-400">Name</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-neutral-400">Frequency</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-neutral-400">Day</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-neutral-400">Season</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-neutral-400">Active</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-neutral-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-neutral-500">Loading…</td></tr>
            )}
            {!isLoading && schedules.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-neutral-500">No schedules yet. Click {`"Add Schedule"`} to create one.</td></tr>
            )}
            {schedules.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 dark:border-neutral-800 last:border-0 hover:bg-slate-50 dark:hover:bg-muted/40">
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-neutral-100">{s.name}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-neutral-400">{FREQUENCY_LABELS[s.frequency]}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-neutral-400">
                  {s.frequency === 'custom'
                    ? `${s.customDates?.length ?? 0} dates`
                    : s.frequency === 'monthly' && s.weekOfMonth
                    ? `${WEEK_OF_MONTH_LABELS[s.weekOfMonth]} ${s.dayOfWeek}`
                    : s.dayOfWeek}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-neutral-400 text-xs">
                  {s.frequency === 'custom'
                    ? <span className="text-slate-400 dark:text-neutral-500">—</span>
                    : s.seasonStart && s.seasonEnd
                    ? `${s.seasonStart} – ${s.seasonEnd}`
                    : s.seasonStart ? `From ${s.seasonStart}`
                    : s.seasonEnd ? `Until ${s.seasonEnd}`
                    : <span className="text-slate-400 dark:text-neutral-500">Year-round</span>}
                </td>
                <td className="px-4 py-3">
                  <Switch checked={s.isActive} onCheckedChange={() => handleToggleActive(s)} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <SchedulePreviewPopover schedule={s} />
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)} className="h-8 w-8 p-0">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(s)} className="h-8 w-8 p-0 text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ScheduleDialog open={dialogOpen} schedule={editing} onClose={handleClose} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? Jobs using this schedule will retain their schedule name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
