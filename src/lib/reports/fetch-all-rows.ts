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
  error: { message: string } | null;
}

interface Rangeable {
  range(from: number, to: number): PromiseLike<PageResult>;
}

const DEFAULT_PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  build: () => Rangeable,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await build().range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data as T[] | null) ?? [];
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}
