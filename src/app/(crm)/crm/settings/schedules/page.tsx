"use client";

import { useState, useMemo, useEffect } from "react";
import { useAllCRMSchedules, useCreateCRMSchedule, useUpdateCRMSchedule, useDeleteCRMSchedule, useBulkImportCRMSchedules } from "@/lib/hooks/use-crm-jobs";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import type { CRMSchedule } from "@/types/crm-jobs";
import { Button } from "@/components/ui/button";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { toast } from "sonner";
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
import { Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import { ruleFromScheduleRow, scheduleOccurrences } from "@/lib/visits/recurrence";

// ── constants ─────────────────────────────────────────────────────────────────

const FREQUENCY_LABELS: Record<CRMSchedule['frequency'], string> = {
  weekly:        'Weekly',
  bi_weekly:     'Bi-Weekly',
  every_3_weeks: 'Every 3 Weeks',
  every_4_weeks: 'Every 4 Weeks',
  monthly:       'Monthly',
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
      <Label>{label}</Label>
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
}

function defaultForm(): ScheduleFormValues {
  return { name: '', frequency: 'weekly', dayOfWeek: 'Mon', weekPattern: null, anchorDate: '', seasonStart: '', seasonEnd: '', weekOfMonth: null };
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
    };
    try {
      if (schedule) {
        await updateSchedule.mutateAsync({ id: schedule.id, patch: payload });
      } else {
        await createSchedule.mutateAsync(payload);
      }
      onClose();
    } catch {
      toast.error(schedule ? "Failed to update schedule" : "Failed to create schedule");
    }
  }

  const isBiWeekly = form.frequency === 'bi_weekly';
  const isMonthly = form.frequency === 'monthly';
  const showAnchor = isBiWeekly && (form.weekPattern === 'even' || form.weekPattern === 'odd');
  const isPending = createSchedule.isPending || updateSchedule.isPending;

  // Live preview from current form values
  const previewSched: CRMSchedule = {
    id: '', orgId: '', name: form.name, isActive: true,
    frequency: form.frequency, dayOfWeek: form.dayOfWeek,
    weekPattern: form.weekPattern, anchorDate: form.anchorDate || null,
    seasonStart: form.seasonStart || null, seasonEnd: form.seasonEnd || null,
    weekOfMonth: form.weekOfMonth,
  };
  const previewDates = useMemo(() => computeUpcomingDates(previewSched, 12), [form]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 h-[90vh] flex flex-col sm:p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{schedule ? 'Edit Schedule' : 'Add Schedule'}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="shrink-0 border-b bg-white rounded-none justify-start px-4 py-0 h-10 gap-0">
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
                      <p className="text-xs text-slate-500">E.g. &ldquo;1st Monday&rdquo; of every month.</p>
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
                <div className="w-full md:w-52 md:shrink-0 flex flex-col rounded-lg border overflow-hidden self-start">
                  <div className="text-white text-xs font-semibold px-3 py-2 flex items-center gap-1.5" style={{ backgroundColor: brandColor }}>
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
        <h1 className="text-2xl font-bold text-slate-900">Schedules</h1>
        <p className="text-slate-500 text-sm mt-1">
          Configure recurring service schedule templates — frequency, day, week pattern, and season window.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        <span className="text-sm text-slate-500">{schedules.length} schedule{schedules.length !== 1 ? 's' : ''}</span>
        <div className="flex flex-wrap items-center gap-2">
          <ImportExportMenu
            entityLabel="Schedules"
            templateColumns={["name", "frequency", "dayOfWeek", "weekPattern", "anchorDate", "seasonStart", "seasonEnd", "weekOfMonth"]}
            templateFilename="schedules-template.csv"
            requiredColumns={["name", "frequency", "dayOfWeek"]}
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

      <div className="rounded-lg border border-slate-200 overflow-x-auto">
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
                <td className="px-4 py-3 text-slate-600">
                  {s.frequency === 'monthly' && s.weekOfMonth
                    ? `${WEEK_OF_MONTH_LABELS[s.weekOfMonth]} ${s.dayOfWeek}`
                    : s.dayOfWeek}
                </td>
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
