import type { CrewVisit, VisitStatus } from '@/lib/types';

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
