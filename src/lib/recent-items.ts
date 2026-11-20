// "Recent" shortcuts shown when the global search opens with nothing typed: the last few clients,
// leads, invoices and estimates this person opened or picked from search. Kept in this browser only
// (localStorage, one list per signed-in user) so nothing about it is stored on the server.

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
