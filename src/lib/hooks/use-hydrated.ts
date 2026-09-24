"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during SSR and the hydration render, true afterwards — and true on the
 * very first render of anything mounted after hydration (client navigation),
 * so it adds no loading flash there.
 *
 * Use it to hold back client-only data during hydration. TanStack's useQuery
 * renders straight from the cache, so a Suspense boundary that hydrates after
 * a query has already resolved would otherwise render data the server HTML
 * never had and throw a hydration mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
