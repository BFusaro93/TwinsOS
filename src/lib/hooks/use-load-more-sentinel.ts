"use client";

import { useEffect, useRef } from "react";

/**
 * Infinite scroll for a TanStack infinite query: returns a ref for an element
 * placed after the last row. When it scrolls within `rootMargin` of view, the
 * next page is fetched. Pair with a visible "Load more" button as a fallback.
 */
export function useLoadMoreSentinel<T extends Element = HTMLDivElement>({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  rootMargin = "400px",
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  rootMargin?: string;
}) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fetchNextPage();
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rootMargin]);
  return ref;
}
