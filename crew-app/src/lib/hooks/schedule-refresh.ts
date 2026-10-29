// Tiny pub/sub so something outside a screen (a push notification arriving)
// can ask every mounted useCrewStops() to refetch today's schedule.

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeScheduleRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitScheduleRefresh(): void {
  for (const l of listeners) l();
}
