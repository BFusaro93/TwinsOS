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

export interface FetchAllRowsOptions {
  /**
   * Unique column every page is tie-broken on. Defaults to `id`; a view
   * without one (v_pm_schedule_pause_state, rpt_invoice_link_billing) must
   * name its own key, or each call logs a 400 "column ….id does not exist"
   * in Postgres before falling back to unordered paging.
   */
  orderBy?: string;
  pageSize?: number;
}

// Offset paging without an ORDER BY has no guarantee that page N+1 continues
// where page N stopped — past 1000 rows, rows can repeat or go missing, and
// totals drift between runs. Every page is therefore tie-broken on a unique
// column (`id` unless `orderBy` says otherwise), which callers' own ordering
// (if any) still takes precedence over.
export async function fetchAllRows<T>(
  build: () => Rangeable,
  { orderBy = "id", pageSize = DEFAULT_PAGE_SIZE }: FetchAllRowsOptions = {}
): Promise<T[]> {
  const out: T[] = [];
  // A relation without the tie-break column (42703 undefined_column) pages
  // unordered rather than failing the report. Postgres still logs that first
  // failed attempt, so pass `orderBy` for id-less relations.
  let ordered = true;
  for (let offset = 0; ; offset += pageSize) {
    const fetchPage = (withOrder: boolean) => {
      const q = build();
      return (withOrder && q.order ? q.order(orderBy) : q).range(offset, offset + pageSize - 1);
    };
    let { data, error } = await fetchPage(ordered);
    if (error?.code === "42703" && ordered) {
      ordered = false;
      ({ data, error } = await fetchPage(false));
    }
    if (error) throw new Error(error.message);
    const page = (data as T[] | null) ?? [];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}
