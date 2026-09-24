// Client-safe formatting for package / waiting-list service windows
// (visit-labels.ts is server-only). Dates are YYYY-MM-DD, parsed as local
// midnight so they don't slip a day in US timezones.

function d(iso: string) {
  return new Date(iso + "T00:00:00");
}

/** "Oct 1 – 31, 2026", "Oct 1 – Nov 15, 2026", or "Dec 1, 2026 – Jan 15, 2027". */
export function formatVisitWindow(start: string, end: string): string {
  const s = d(start);
  const e = d(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  const md = (x: Date) => x.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (sameMonth) return `${md(s)} – ${e.getDate()}, ${e.getFullYear()}`;
  if (sameYear) return `${md(s)} – ${md(e)}, ${e.getFullYear()}`;
  return `${md(s)}, ${s.getFullYear()} – ${md(e)}, ${e.getFullYear()}`;
}

/** Short phrase for when a windowed visit will happen, relative to today. */
export function describeVisitWindow(start: string, end: string, today: string): string {
  if (start <= today) {
    return `Anytime through ${d(end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return `Anytime ${formatVisitWindow(start, end)}`;
}
