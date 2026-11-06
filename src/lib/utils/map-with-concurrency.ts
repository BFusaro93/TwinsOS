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
