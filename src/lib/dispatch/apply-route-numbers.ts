/**
 * Manual route numbering, Service Autopilot style: the dispatcher types a stop
 * number on each job, then presses one Apply button that reorders everything
 * by the numbers typed — nothing moves while they are still typing.
 *
 * Each crew runs its own route, so numbers are crew-relative ("3" is the 3rd
 * stop for THAT crew) and applying one crew's numbers never touches another
 * crew's order.
 */

/**
 * Order one crew's stops by typed numbers.
 *
 * - Every stop numbered: plain sort by number (gaps like 10/20/30 are fine);
 *   equal numbers keep their current relative order.
 * - Only some stops numbered: each numbered stop takes its number's slot
 *   (clamped to the crew's stop count; a taken slot moves it to the nearest
 *   free one), and the un-numbered stops fill the remaining slots in their
 *   current order — so typing "1" on one job just moves it to the front.
 */
export function orderCrewByNumbers(ids: string[], numbers: ReadonlyMap<string, number>): string[] {
  const idx = new Map(ids.map((id, i) => [id, i]));
  const numbered = ids
    .filter((id) => numbers.has(id))
    .sort((a, b) => (numbers.get(a)! - numbers.get(b)!) || (idx.get(a)! - idx.get(b)!));
  const unnumbered = ids.filter((id) => !numbers.has(id));
  if (unnumbered.length === 0) return numbered;

  const slots: (string | null)[] = new Array(ids.length).fill(null);
  for (const id of numbered) {
    const want = Math.min(Math.max(numbers.get(id)!, 1), ids.length) - 1;
    let slot = -1;
    for (let i = want; i < slots.length; i++) if (slots[i] === null) { slot = i; break; }
    if (slot === -1) for (let i = want - 1; i >= 0; i--) if (slots[i] === null) { slot = i; break; }
    slots[slot] = id;
  }
  let next = 0;
  return slots.map((s) => s ?? unnumbered[next++]);
}

/**
 * Apply typed numbers across the whole board order.
 *
 * `order` is every visible visit id in display order; `crewKeyOf` maps an id to
 * its (effective) crew. Each crew's subsequence is reordered in place and
 * spliced back, so every other crew's ids keep their exact positions.
 * Returns the new order plus the crews that had two stops given the same number.
 */
export function applyRouteNumbers(
  order: string[],
  crewKeyOf: (id: string) => string,
  numbers: ReadonlyMap<string, number>
): { order: string[]; crewsWithDuplicates: string[] } {
  const byCrew = new Map<string, string[]>();
  for (const id of order) {
    const key = crewKeyOf(id);
    if (!byCrew.has(key)) byCrew.set(key, []);
    byCrew.get(key)!.push(id);
  }

  const reordered = new Map<string, string[]>();
  const crewsWithDuplicates: string[] = [];
  for (const [key, ids] of byCrew) {
    const seen = new Set<number>();
    let dup = false;
    for (const id of ids) {
      const n = numbers.get(id);
      if (n === undefined) continue;
      if (seen.has(n)) dup = true;
      seen.add(n);
    }
    if (dup) crewsWithDuplicates.push(key);
    reordered.set(key, orderCrewByNumbers(ids, numbers));
  }

  const cursor = new Map<string, number>();
  const next = order.map((id) => {
    const key = crewKeyOf(id);
    const i = cursor.get(key) ?? 0;
    cursor.set(key, i + 1);
    return reordered.get(key)![i];
  });
  return { order: next, crewsWithDuplicates };
}
