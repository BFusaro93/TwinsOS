import type { QueryClient } from "@tanstack/react-query";

/** Per-client sub-queries an invoice, payment or card change can't affect. */
const UNAFFECTED = new Set(["contacts", "properties", "display-name"]);

/**
 * An invoice, payment, credit or saved card changed: refresh what shows a
 * client's balance or billing state — every client list/count, the client
 * records, their activity timelines and sub-account lists — but not their
 * contacts or properties, which a bare `["clients"]` invalidation re-fetched
 * for every client open in the session. Inactive queries are only marked
 * stale, as with any invalidation.
 */
export function invalidateClientBalances(qc: QueryClient) {
  return qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === "clients" && !UNAFFECTED.has(q.queryKey[2] as string),
  });
}
