"use client";

import { useState, useMemo, useEffect } from "react";
import { useAllCRMSchedules, useCreateCRMSchedule, useUpdateCRMSchedule, useDeleteCRMSchedule } from "@/lib/hooks/use-crm-jobs";
import type { CRMSchedule } from "@/types/crm-jobs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Pencil, Trash2, CalendarDays } from "lucide-react";

// ── constants ─────────────────────────────────────────────────────────────────

const FREQUENCY_LABELS: Record<CRMSchedule['frequency'], string> = {
  weekly:        'Weekly',
  bi_weekly:     'Bi-Weekly',
  every_3_weeks: 'Every 3 Weeks',
  every_4_weeks: 'Every 4 Weeks',
  monthly:       'Monthly',
};

const FREQUENCY_DAYS: Record<CRMSchedule['frequency'], number> = {
  weekly: 7, bi_weekly: 14, every_3_weeks: 21, every_4_weeks: 28, monthly: 30,
};

const DAY_OPTIONS: CRMSchedule['dayOfWeek'][] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_JS: Record<CRMSchedule['dayOfWeek'], number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── schedule date calculator ──────────────────────────────────────────────────

function computeUpcomingDates(sched: CRMSchedule, count = 20): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDay = DAY_JS[sched.dayOfWeek];
  const intervalDays = FREQUENCY_DAYS[sched.frequency];

  // Find first occurrence of target weekday at or after today
  const cursor = new Date(today);
  while (cursor.getDay() !== targetDay) {
    cursor.setDate(cursor.getDate() + 1);
  }

  // For bi_weekly with a week pattern, determine parity using a stable anchor.
  // If no anchor is set, use the first candidate date as the "even" reference week
  // so the algorithm is deterministic and doesn't depend on today's calendar week.
  let biWeeklyAnchor: Date | null = null;
  if (sched.frequency === 'bi_weekly' && sched.weekPattern && sched.weekPattern !== 'any') {
    if (sched.anchorDate) {
      // Use the stored anchor; find that weekday's Monday to align to week boundaries
      biWeeklyAnchor = new Date(sched.anchorDate + 'T00:00:00');
    } else {
      // Anchor = first candidate weekday. That week is "even" (week 0).
      biWeeklyAnchor = new Date(cursor);
    }
  }

  const results: Date[] = [];
  const maxTries = count * 120;
  let tries = 0;

  while (results.length < count && tries < maxTries) {
    tries++;
    const d = new Date(cursor);

    // Week pattern filter for bi_weekly — advance by 7 (not 14) when wrong parity
    // so we probe the adjacent week without overshooting the whole cycle.
    if (biWeeklyAnchor && sched.weekPattern && sched.weekPattern !== 'any') {
      const diffDays = Math.round((d.getTime() - biWeeklyAnchor.getTime()) / 86_400_000);
      // Use absolute week index so negative diffs still produce consistent parity
      const weekNum = Math.floor(Math.abs(diffDays) / 7) * (diffDays < 0 ? -1 : 1);
      const isEvenWeek = Math.abs(weekNum) % 2 === 0;
      const wantEven = sched.weekPattern === 'even';
      if (wantEven !== isEvenWeek) {
        // Wrong parity — jump 7 days to the other week of this bi-weekly cycle
        cursor.setDate(cursor.getDate() + 7);
        continue;
      }
    }

    // Season filter
    if (sched.seasonStart || sched.seasonEnd) {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd2 = String(d.getDate()).padStart(2, '0');
      const md = `${mm}-${dd2}`;
      const start = sched.seasonStart ?? '01-01';
      const end = sched.seasonEnd ?? '12-31';
      const inSeason = start <= end
        ? md >= start && md <= end
        : md >= start || md <= end; // wraps year (e.g. Nov–Feb)
      if (!inSeason) {
        cursor.setDate(cursor.getDate() + intervalDays);
        continue;
      }
    }

    results.push(d);
    cursor.setDate(cursor.getDate() + intervalDays);
  }

  return results;
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// ── MonthDayPicker ────────────────────────────────────────────────────────────

function MonthDayPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const parts = value ? value.split('-') : ['', ''];
  const month = parts[0] ?? '';
  const day = parts[1] ?? '';

  function update(m: string, d: string) {
    if (m && d) onChange(`${m}-${d}`);
    else onChange('');
  }

  const daysInMonth = month ? new Date(2024, parseInt(month), 0).getDate() : 31;

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Select value={month} onValueChange={(m) => update(m, day)}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={i} value={String(i + 1).padStart(2, '0')}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={day} onValueChange={(d) => update(month, d)}>
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

// ── ScheduleDialog ────────────────────────────────────────────────────────────

interface ScheduleFormValues {
  name: string;
  frequency: CRMSchedule['frequency'];
  dayOfWeek: CRMSchedule['dayOfWeek'];
  weekPattern: CRMSchedule['weekPattern'];
  anchorDate: string;
  seasonStart: string;
  seasonEnd: string;
}

function defaultForm(): ScheduleFormValues {
  return { name: '', frequency: 'weekly', dayOfWeek: 'Mon', weekPattern: null, anchorDate: '', seasonStart: '', seasonEnd: '' };
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
      if (key === 'weekPattern' && (value === 'any' || value === null)) {
        next.anchorDate = '';
      }
      return next;
    });
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
    };
    if (schedule) {
      await updateSchedule.mutateAsync({ id: schedule.id, patch: payload });
    } else {
      await createSchedule.mutateAsync(payload);
    }
    onClose();
  }

  const isBiWeekly = form.frequency === 'bi_weekly';
  const showAnchor = isBiWeekly && (form.weekPattern === 'even' || form.weekPattern === 'odd');
  const isPending = createSchedule.isPending || updateSchedule.isPending;

  // Live preview from current form values
  const previewSched: CRMSchedule = {
    id: '', orgId: '', name: form.name, isActive: true,
    frequency: form.frequency, dayOfWeek: form.dayOfWeek,
    weekPattern: form.weekPattern, anchorDate: form.anchorDate || null,
    seasonStart: form.seasonStart || null, seasonEnd: form.seasonEnd || null,
  };
  const previewDates = useMemo(() => computeUpcomingDates(previewSched, 12), [form]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{schedule ? 'Edit Schedule' : 'Add Schedule'}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-5 pt-2">
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
              <div className="space-y-1.5">
                <Label>Day of Week</Label>
                <Select value={form.dayOfWeek} onValueChange={(v) => setField('dayOfWeek', v as CRMSchedule['dayOfWeek'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAY_OPTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

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
                <Label>Anchor Date <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input type="date" value={form.anchorDate} onChange={(e) => setField('anchorDate', e.target.value)} />
                <p className="text-xs text-slate-500">A known service date used to determine even/odd week alignment.</p>
              </div>
            )}

            {/* Season window */}
            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-xs font-semibold text-slate-600">Season Window <span className="font-normal text-slate-400">(optional)</span></p>
              <div className="grid grid-cols-2 gap-3">
                <MonthDayPicker label="Season Start" value={form.seasonStart} onChange={(v) => setField('seasonStart', v)} />
                <MonthDayPicker label="Season End" value={form.seasonEnd} onChange={(v) => setField('seasonEnd', v)} />
              </div>
              <p className="text-xs text-slate-400">E.g. April 1 – November 30 for mowing season. Leave blank for year-round.</p>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending || !form.name.trim()}>
                {isPending ? 'Saving…' : schedule ? 'Save Changes' : 'Add Schedule'}
              </Button>
            </DialogFooter>
          </form>

          {/* Right: date preview */}
          <div className="w-52 shrink-0 flex flex-col rounded-lg border overflow-hidden self-start">
            <div className="bg-slate-800 text-white text-xs font-semibold px-3 py-2 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> Upcoming Dates
            </div>
            <div className="divide-y text-xs max-h-80 overflow-y-auto">
              {previewDates.length === 0 ? (
                <p className="px-3 py-4 text-slate-400 text-center">No dates in season</p>
              ) : (
                previewDates.map((d, i) => (
                  <div key={i} className="px-3 py-1.5 text-slate-700">{formatDate(d)}</div>
                ))
              )}
            </div>
            <div className="border-t bg-slate-50 px-3 py-1.5 text-[10px] text-slate-400">
              Next {previewDates.length} occurrences
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function SchedulePreviewPopover({ schedule }: { schedule: CRMSchedule }) {
  const dates = useMemo(() => computeUpcomingDates(schedule, 12), [schedule]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-brand-600">
          <CalendarDays className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="end">
        <div className="bg-slate-800 text-white text-xs font-semibold px-3 py-2">
          Next {dates.length} dates
        </div>
        <div className="divide-y max-h-64 overflow-y-auto">
          {dates.length === 0 ? (
            <p className="px-3 py-4 text-slate-400 text-center text-xs">No dates in season</p>
          ) : (
            dates.map((d, i) => (
              <div key={i} className="px-3 py-1.5 text-xs text-slate-700">{formatDate(d)}</div>
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CRMSchedule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CRMSchedule | null>(null);

  function openAdd() { setEditing(null); setDialogOpen(true); }
  function openEdit(s: CRMSchedule) { setEditing(s); setDialogOpen(true); }
  function handleClose() { setDialogOpen(false); setEditing(null); }

  async function handleToggleActive(s: CRMSchedule) {
    await updateSchedule.mutateAsync({ id: s.id, patch: { isActive: !s.isActive } });
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    await deleteSchedule.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Schedules</h1>
        <p className="text-slate-500 text-sm mt-1">
          Configure recurring service schedule templates — frequency, day, week pattern, and season window.
        </p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-500">{schedules.length} schedule{schedules.length !== 1 ? 's' : ''}</span>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Schedule
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Frequency</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Day</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Season</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Active</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            )}
            {!isLoading && schedules.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No schedules yet. Click {`"Add Schedule"`} to create one.</td></tr>
            )}
            {schedules.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                <td className="px-4 py-3 text-slate-600">{FREQUENCY_LABELS[s.frequency]}</td>
                <td className="px-4 py-3 text-slate-600">{s.dayOfWeek}</td>
                <td className="px-4 py-3 text-slate-600 text-xs">
                  {s.seasonStart && s.seasonEnd
                    ? `${s.seasonStart} – ${s.seasonEnd}`
                    : s.seasonStart ? `From ${s.seasonStart}`
                    : s.seasonEnd ? `Until ${s.seasonEnd}`
                    : <span className="text-slate-400">Year-round</span>}
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
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(s)} className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50">
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
