import type { CrewDriveInfo, CrewStop, CrewVisit } from '@/lib/types';

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

/** A CrewStop with pending local clock/pause queue actions optimistically applied. */
export interface EffectiveStop extends CrewStop {
  hasPendingClockAction: boolean;
  hasPendingPauseAction: boolean;
}

/**
 * Stop-model counterpart to applyQueueOverlay() above — merges a
 * server-fetched CrewStop with the pending/syncing queue items keyed to its
 * anchorVisitId (clock_in/clock_out/pause/resume all target the anchor, same
 * as the web stop page — see src/lib/utils/visit-stops.ts). Failed items are
 * excluded here for the same reason as applyQueueOverlay(): they're
 * surfaced separately so the crew member decides to retry or discard rather
 * than silently redefining the stop's state.
 */
export function applyStopQueueOverlay(stop: CrewStop, queueItemsForStop: QueueItem[]): EffectiveStop {
  const clockItems = queueItemsForStop.filter(
    (i) => (i.type === 'clock_in' || i.type === 'clock_out') && i.status !== 'failed'
  );
  const pauseItems = queueItemsForStop.filter(
    (i) => (i.type === 'pause' || i.type === 'resume') && i.status !== 'failed'
  );
  const acknowledgeItem = queueItemsForStop.find(
    (i) => i.type === 'acknowledge_notes' && i.status !== 'failed'
  );

  let clockedInAt = stop.clockedInAt;
  let clockedOutAt = stop.clockedOutAt;
  let derivedStatus = stop.derivedStatus;

  for (const item of clockItems) {
    if (item.type === 'clock_in') {
      clockedInAt = clockedInAt ?? item.createdAt;
      if (derivedStatus === 'scheduled' || derivedStatus === 'dispatched') derivedStatus = 'in_progress';
    } else {
      clockedOutAt = clockedOutAt ?? item.createdAt;
      derivedStatus = 'completed';
    }
  }

  // Oldest-first (queue items are always read in that order — see db.ts),
  // so applying each in sequence lands on the correct final pausedAt even
  // across multiple pause/resume cycles still in flight.
  let pausedAt = stop.pausedAt;
  for (const item of pauseItems) {
    pausedAt = item.type === 'pause' ? (pausedAt ?? item.createdAt) : null;
  }

  // Optimistically mark the anchor visit's notes as acknowledged, mirroring
  // web's `anchor.acknowledgedNotesAt` gate (see visit/[id].tsx) — otherwise
  // Clock In would stay disabled until the next refetch even though the tap
  // already queued successfully.
  const visits = acknowledgeItem
    ? stop.visits.map((v) =>
        v.id === stop.anchorVisitId
          ? { ...v, acknowledgedNotesAt: v.acknowledgedNotesAt ?? acknowledgeItem.createdAt }
          : v
      )
    : stop.visits;

  return {
    ...stop,
    visits,
    clockedInAt,
    clockedOutAt,
    pausedAt,
    derivedStatus,
    hasPendingClockAction: clockItems.length > 0,
    hasPendingPauseAction: pauseItems.length > 0,
  };
}

/** CrewDriveInfo with a pending local drive_start/drive_end queue action optimistically applied. */
export interface EffectiveDriveInfo extends CrewDriveInfo {
  hasPendingDriveAction: boolean;
}

/**
 * Merges the day-level drive info with any pending/syncing drive_start /
 * drive_end queue items — same optimistic-UI reasoning as the stop/visit
 * overlays above, so "Start Drive"/"Arrived" flips immediately rather than
 * waiting on a round trip. A pending drive_start synthesizes a placeholder
 * open segment (no real id yet); a pending drive_end simply hides whatever
 * segment the server last reported as open.
 */
export function applyDriveOverlay(drive: CrewDriveInfo, driveQueueItems: QueueItem[]): EffectiveDriveInfo {
  const active = driveQueueItems.filter(
    (i) => (i.type === 'drive_start' || i.type === 'drive_end') && i.status !== 'failed'
  );

  let openSegment = drive.openSegment;
  for (const item of active) {
    if (item.type === 'drive_start') {
      openSegment = openSegment ?? { id: `pending-${item.id}`, startedAt: item.createdAt, endedAt: null, minutes: null };
    } else {
      openSegment = null;
    }
  }

  return { ...drive, openSegment, hasPendingDriveAction: active.length > 0 };
}
