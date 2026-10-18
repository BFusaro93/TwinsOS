/**
 * When a crew action ACTUALLY happened, for actions that can be queued offline.
 *
 * The crew app queues clock-in/out, pause/resume and drive start/end while it has
 * no signal and replays them when it reconnects. The routes used to stamp the
 * server's `new Date()`, so a 12:00-12:30 lunch pause that synced at 3pm landed at
 * 15:00 with the resume seconds later: the 30-minute break netted ~0 minutes and
 * was paid as work, drive segments collapsed to ~0, and an offline clock-out credited
 * every hour until the sync as time on site.
 *
 * Clients now send the moment of the tap as `occurredAt`. It is only honored inside
 * a window — never in the future (beyond clock skew), never earlier than `notBefore`
 * (e.g. the visit's own clock-in) and never more than MAX_BACKDATE_HOURS old — so a
 * wrong device clock or a crafted request can't rewrite history; outside it the
 * server's own time is used, exactly as before.
 */
const MAX_BACKDATE_MS = 48 * 3_600_000;
const FUTURE_SKEW_MS = 2 * 60_000;

export function resolveOccurredAt(
  raw: unknown,
  opts: { notBefore?: string | null; now?: Date } = {}
): Date {
  const now = opts.now ?? new Date();
  if (typeof raw !== "string") return now;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return now;
  const notBeforeMs = opts.notBefore ? Date.parse(opts.notBefore) : NaN;
  const floor = Math.max(now.getTime() - MAX_BACKDATE_MS, Number.isFinite(notBeforeMs) ? notBeforeMs : 0);
  if (t < floor || t > now.getTime() + FUTURE_SKEW_MS) return now;
  return new Date(Math.min(t, now.getTime()));
}

/** Reads `occurredAt` from a JSON body without consuming it for the caller's own parse. */
export async function readOccurredAt(request: Request): Promise<unknown> {
  try {
    const body = (await request.clone().json()) as { occurredAt?: unknown } | null;
    return body?.occurredAt;
  } catch {
    return undefined;
  }
}
