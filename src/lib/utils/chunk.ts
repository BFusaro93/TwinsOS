/**
 * PostgREST puts `.in("id", ids)` in the URL, and a few hundred UUIDs exceed
 * the API gateway's URL limit (postgrest-js warns past 8,000 characters,
 * about 200 ids). Bulk reads and writes split their id lists with this.
 */
export const IN_FILTER_CHUNK = 100;

export function chunk<T>(items: readonly T[], size: number = IN_FILTER_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
