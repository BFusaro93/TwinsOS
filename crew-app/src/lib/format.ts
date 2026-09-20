import type { CrewStop, CrewVisit, VisitStatus } from '@/lib/types';

/** Formats a "HH:mm:ss" or "HH:mm" DB time string as "h:mm AM/PM". */
export function formatTime(time: string | null): string | null {
  if (!time) return null;
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatTimeWindow(visit: Pick<CrewVisit, 'startTime' | 'endTime'>): string {
  const start = formatTime(visit.startTime);
  const end = formatTime(visit.endTime);
  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  return 'Unscheduled';
}

export function formatAddress(visit: CrewVisit): string | null {
  const { line1, city, state } = visit.address;
  const parts = [line1, [city, state].filter(Boolean).join(', ')].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * A visit's crew-facing progress state, derived from clock timestamps (not
 * just `status`, since `status` can also be 'cancelled'/'skipped' which this
 * screen surfaces separately).
 */
export type VisitProgress = 'not_started' | 'clocked_in' | 'completed' | 'skipped';

export function visitProgress(visit: Pick<CrewVisit, 'status' | 'clockedInAt' | 'clockedOutAt'>): VisitProgress {
  if (visit.status === 'cancelled' || visit.status === 'skipped') return 'skipped';
  if (visit.clockedOutAt) return 'completed';
  if (visit.clockedInAt) return 'clocked_in';
  return 'not_started';
}

export const PROGRESS_LABEL: Record<VisitProgress, string> = {
  not_started: 'Not started',
  clocked_in: 'Clocked in',
  completed: 'Completed',
  skipped: 'Skipped',
};

export const PROGRESS_COLOR: Record<VisitProgress, string> = {
  not_started: '#8a8a8a',
  clocked_in: '#208AEF',
  completed: '#2fa84f',
  skipped: '#b0b0b0',
};

export const STATUS_LABEL: Record<VisitStatus, string> = {
  scheduled: 'Scheduled',
  dispatched: 'Dispatched',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  skipped: 'Skipped',
};

/** Live elapsed-time string (e.g. "1h 24m") between an ISO timestamp and now. */
export function elapsedSince(isoTimestamp: string, now: Date = new Date()): string {
  const ms = Math.max(0, now.getTime() - new Date(isoTimestamp).getTime());
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// ── stop-model helpers ──────────────────────────────────────────────────────
// CrewStop counterparts to the CrewVisit helpers above, adding an 'on_break'
// state that has no equivalent on the old flat visit model.

export type StopProgress = 'not_started' | 'clocked_in' | 'on_break' | 'completed' | 'skipped';

export function stopProgress(
  stop: Pick<CrewStop, 'derivedStatus' | 'clockedInAt' | 'clockedOutAt' | 'pausedAt'>
): StopProgress {
  if (stop.derivedStatus === 'cancelled' || stop.derivedStatus === 'skipped') return 'skipped';
  if (stop.clockedOutAt) return 'completed';
  if (stop.clockedInAt && stop.pausedAt) return 'on_break';
  if (stop.clockedInAt) return 'clocked_in';
  return 'not_started';
}

export const STOP_PROGRESS_LABEL: Record<StopProgress, string> = {
  not_started: 'Not started',
  clocked_in: 'Clocked in',
  on_break: 'On break',
  completed: 'Completed',
  skipped: 'Skipped',
};

export const STOP_PROGRESS_COLOR: Record<StopProgress, string> = {
  not_started: '#8a8a8a',
  clocked_in: '#208AEF',
  on_break: '#c98a1f',
  completed: '#2fa84f',
  skipped: '#b0b0b0',
};

/** The stop's own pre-joined "line1, city" string, or null if neither was set. */
export function formatStopAddress(stop: Pick<CrewStop, 'address'>): string | null {
  return stop.address && stop.address.trim().length > 0 ? stop.address : null;
}

/** Time window from the stop's earliest-scheduled underlying visit, same fallback rule as formatTimeWindow(). */
export function formatStopTimeWindow(stop: Pick<CrewStop, 'visits'>): string {
  const withStart = stop.visits.find((v) => v.startTime);
  return formatTimeWindow({ startTime: withStart?.startTime ?? null, endTime: withStart?.endTime ?? null });
}

/** Comma-joined service names across every visit in the stop, for the schedule card's subtitle. */
export function stopServiceNames(stop: Pick<CrewStop, 'visits'>): string {
  return stop.visits.map((v) => v.serviceName).filter(Boolean).join(', ');
}
