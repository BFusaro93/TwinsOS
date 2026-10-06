// ============================================================
// PostgREST paging for bespoke report handlers.
//
// PostgREST caps every response at the server's max-rows setting (1000 on
// Supabase) regardless of `.limit(5000)`, so any handler that "fetched
// everything" with a big limit was silently truncated once a table grew past
// 1000 rows. This walks `.range()` pages until a short page comes back.
//
// `build` must return a FRESH query builder each call — `.range()` mutates
// the builder it's called on, so reusing one builder across pages would
// re-run the same page.
// ============================================================

interface PageResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface Rangeable {
  range(from: number, to: number): PromiseLike<PageResult>;
  order?(column: string): Rangeable;
}

const DEFAULT_PAGE_SIZE = 1000;

// Offset paging without an ORDER BY has no guarantee that page N+1 continues
// where page N stopped — past 1000 rows, rows can repeat or go missing, and
// totals drift between runs. Every page is therefore tie-broken on `id`, which
// callers' own ordering (if any) still takes precedence over.
export async function fetchAllRows<T>(
  build: () => Rangeable,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<T[]> {
  const out: T[] = [];
  // A relation with no `id` column (42703 undefined_column) pages unordered
  // rather than failing the report.
  let orderById = true;
  for (let offset = 0; ; offset += pageSize) {
    const fetchPage = (ordered: boolean) => {
      const q = build();
      return (ordered && q.order ? q.order("id") : q).range(offset, offset + pageSize - 1);
    };
    let { data, error } = await fetchPage(orderById);
    if (error?.code === "42703" && orderById) {
      orderById = false;
      ({ data, error } = await fetchPage(false));
    }
    if (error) throw new Error(error.message);
    const page = (data as T[] | null) ?? [];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}
