import type { CrewVisit } from '@/lib/types';

import type { ClockOutPayload, QueueItem } from './types';

/** A CrewVisit with pending local queue actions optimistically applied. */
export interface EffectiveVisit extends CrewVisit {
  /** True while a clock-in or clock-out for this visit hasn't been confirmed by the server yet. */
  hasPendingClockAction: boolean;
}

/**
 * Merges a server-fetched CrewVisit with this visit's pending/syncing queue
 * items so the UI reflects the crew member's own action immediately — the
 * "optimistic UI" requirement: what's on screen comes from the local queue,
 * not from waiting on a server round-trip. Once the sync engine confirms an
 * action, its queue item is removed and the next refetch() naturally
 * converges back to plain server truth.
 *
 * Failed items (conflict or exhausted retries) are deliberately excluded
 * here — they don't get to silently redefine the visit's state; they're
 * surfaced separately (see the "Didn't sync" banner in visit/[id].tsx) and
 * the crew member decides whether to retry or discard.
 */
export function applyQueueOverlay(visit: CrewVisit, queueItemsForVisit: QueueItem[]): EffectiveVisit {
  const active = queueItemsForVisit.filter(
    (i) => (i.type === 'clock_in' || i.type === 'clock_out') && i.status !== 'failed'
  );

  let clockedInAt = visit.clockedInAt;
  let clockedOutAt = visit.clockedOutAt;
  let completionNotes = visit.completionNotes;
  let status = visit.status;

  for (const item of active) {
    if (item.type === 'clock_in') {
      clockedInAt = clockedInAt ?? item.createdAt;
      if (status === 'scheduled' || status === 'dispatched') status = 'in_progress';
    } else {
      const payload = item.payload as ClockOutPayload;
      clockedOutAt = clockedOutAt ?? item.createdAt;
      completionNotes = payload.notes ?? completionNotes ?? null;
      status = 'completed';
    }
  }

  return {
    ...visit,
    clockedInAt,
    clockedOutAt,
    completionNotes,
    status,
    hasPendingClockAction: active.length > 0,
  };
}
