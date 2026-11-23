// "Recent" shortcuts shown when the global search opens with nothing typed: the last few clients,
// leads, invoices and estimates this person opened or picked from search. Kept in this browser only
// (localStorage, one list per signed-in user) so nothing about it is stored on the server.

import { createClient } from "@/lib/supabase/client";

export type RecentItemKind = "client" | "lead" | "invoice" | "estimate";

export type RecentItem = {
  kind: RecentItemKind;
  id: string;
  label: string;
  sub?: string;
  href: string;
};

const MAX_ITEMS = 6;
const storageKey = (userId: string) => `landscapt:recent-search:v1:${userId}`;

export function readRecentItems(userId: string): RecentItem[] {
  if (!userId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is RecentItem =>
        !!i && typeof i === "object" && typeof i.id === "string" && typeof i.label === "string" && typeof i.href === "string"
    );
  } catch {
    return [];
  }
}

/** Puts an item at the front of the list (moving it up if it was already there). */
export function pushRecentItem(userId: string, item: RecentItem): void {
  if (!userId) return;
  try {
    const rest = readRecentItems(userId).filter((i) => !(i.kind === item.kind && i.id === item.id));
    window.localStorage.setItem(storageKey(userId), JSON.stringify([item, ...rest].slice(0, MAX_ITEMS)));
  } catch {
    // Private mode or storage full: recents are a convenience, so skip silently.
  }
}

const TABLE_FOR_KIND: Record<RecentItemKind, "clients" | "crm_invoices" | "estimates"> = {
  client: "clients",
  lead: "clients",
  invoice: "crm_invoices",
  estimate: "estimates",
};

/** Drops recents whose record has since been deleted (or is no longer visible to this person),
 *  and saves the trimmed list. If the lookup fails the list is returned untouched. */
export async function pruneMissingRecentItems(userId: string, items: RecentItem[]): Promise<RecentItem[]> {
  if (!userId || items.length === 0) return items;
  try {
    const supabase = createClient();
    const tables = Array.from(new Set(items.map((i) => TABLE_FOR_KIND[i.kind])));
    const alive = new Set<string>();
    await Promise.all(
      tables.map(async (table) => {
        const ids = items.filter((i) => TABLE_FOR_KIND[i.kind] === table).map((i) => i.id);
        const { data, error } = await supabase.from(table).select("id").in("id", ids).is("deleted_at", null);
        if (error) throw error;
        for (const row of data ?? []) alive.add(`${table}:${row.id}`);
      })
    );
    const kept = items.filter((i) => alive.has(`${TABLE_FOR_KIND[i.kind]}:${i.id}`));
    if (kept.length !== items.length) {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(kept));
    }
    return kept;
  } catch {
    return items;
  }
}
