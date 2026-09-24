"use client";

import {
  useQuery as useTanstackQuery,
  type DefaultError,
  type QueryClient,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useHydrated } from "@/lib/hooks/use-hydrated";

/**
 * TanStack's useQuery, but it reports "pending" during the hydration render —
 * exactly what the server rendered, since nothing is fetched or prefetched on
 * the server here.
 *
 * Without this, a Suspense boundary (a page-level one, loading.tsx, or one
 * inside a component) that hydrates after the app shell can render straight
 * from a cache the shell's queries already filled — e.g. TopBar's
 * GlobalSearchDialog loads invoices, clients, POs… on every page — and React
 * throws "Hydration failed" because the server HTML never had that data.
 *
 * Once hydration is done (and for anything mounted afterwards, i.e. client
 * navigation) this is a plain passthrough, so it adds no loading flash.
 *
 * Import useQuery from here, not from @tanstack/react-query (ESLint enforces it).
 */
export function useQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> {
  const hydrated = useHydrated();
  const result = useTanstackQuery(options, queryClient);
  if (hydrated || result.status === "pending") return result;

  // What the server rendered: an empty query that is about to fetch (or
  // idle, if disabled).
  const fetching = options.enabled !== false;
  return {
    ...result,
    data: undefined,
    error: null,
    status: "pending",
    fetchStatus: fetching ? "fetching" : "idle",
    isPending: true,
    isSuccess: false,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    isPlaceholderData: false,
    isFetching: fetching,
    isLoading: fetching,
    isInitialLoading: fetching,
    isRefetching: false,
    isPaused: false,
    isFetched: false,
    isFetchedAfterMount: false,
    isStale: true,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    failureCount: 0,
    failureReason: null,
  } as UseQueryResult<TData, TError>;
}
