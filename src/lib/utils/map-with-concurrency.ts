/**
 * Maps `items` through `fn` with at most `limit` calls in flight, keeping input order.
 * For fan-outs (Stripe lookups, per-record PDF builds) where an unbounded Promise.all
 * would open hundreds of connections at once and run a route past its time limit.
 */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export interface SettledOutcome<T> {
  done: T[];
  failed: { item: T; error: unknown }[];
}

/**
 * Like mapWithConcurrency, but every item is attempted and a rejection is recorded instead of thrown.
 * For bulk writes where "3 of 40 failed" is the answer to report, not an abort: the plain version
 * rejects on the first failure while the other workers keep writing, so the caller shows an error
 * (and skips follow-up steps) for a batch that mostly succeeded.
 */
export async function settleWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<unknown>,
): Promise<SettledOutcome<T>> {
  const results = await mapWithConcurrency(items, limit, (item) =>
    fn(item).then(
      () => ({ item, ok: true as const }),
      (error: unknown) => ({ item, ok: false as const, error }),
    ),
  );
  const done: T[] = [];
  const failed: { item: T; error: unknown }[] = [];
  for (const r of results) {
    if (r.ok) done.push(r.item);
    else failed.push({ item: r.item, error: r.error });
  }
  return { done, failed };
}

/** The first failure's message, for a one-line toast. */
export function firstFailureMessage(failed: { error: unknown }[], fallback: string): string {
  const e = failed[0]?.error;
  return e instanceof Error && e.message ? e.message : fallback;
}
