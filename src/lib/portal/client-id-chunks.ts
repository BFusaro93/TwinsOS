/**
 * A portal login sees its own client plus every sub-account (getPortalAccounts),
 * and PostgREST puts an `.in()` list in the URL: a property manager with a few
 * hundred sub-accounts overflows the API gateway's URL limit and the query
 * fails (the same failure send-campaign.ts hit). These helpers run such a
 * query in chunks and merge the results.
 */

export const PORTAL_ID_CHUNK_SIZE = 100;

export function chunkIds(ids: string[], size = PORTAL_ID_CHUNK_SIZE): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/**
 * Compare two rows on one column the way Postgres orders it by default:
 * NULLs sort as larger than any value (last ascending, first descending).
 * Values are ISO dates/timestamps or numbers, so `<` is the right comparison.
 */
export function byColumn<T>(column: keyof T & string, ascending: boolean) {
  return (a: T, b: T): number => {
    const x = a[column] as unknown as string | number | null | undefined;
    const y = b[column] as unknown as string | number | null | undefined;
    const xNull = x === null || x === undefined;
    const yNull = y === null || y === undefined;
    if (xNull || yNull) {
      if (xNull && yNull) return 0;
      const nullCmp = xNull ? 1 : -1; // NULL is the larger value
      return ascending ? nullCmp : -nullCmp;
    }
    const cmp = x < y ? -1 : x > y ? 1 : 0;
    return ascending ? cmp : -cmp;
  };
}

/**
 * Run `run(chunk)` once per chunk of client ids and merge the rows. With one
 * chunk (the usual case) the query runs exactly as written, so the database's
 * ordering and limit apply. With several, rows are re-sorted with `compare`
 * and cut to `limit`, matching what one query over every id would return.
 * Any chunk failing fails the whole call.
 */
export async function queryByClientIds<T>(
  clientIds: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  merge?: { compare?: (a: T, b: T) => number; limit?: number }
): Promise<{ data: T[] | null; error: unknown }> {
  const chunks = chunkIds(clientIds);
  if (chunks.length <= 1) return run(clientIds);
  const results = await Promise.all(chunks.map((c) => run(c)));
  const failed = results.find((r) => r.error);
  if (failed) return { data: null, error: failed.error };
  let rows = results.flatMap((r) => r.data ?? []);
  if (merge?.compare) rows = rows.sort(merge.compare);
  if (merge?.limit !== undefined) rows = rows.slice(0, merge.limit);
  return { data: rows, error: null };
}
