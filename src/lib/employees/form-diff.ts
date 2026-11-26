// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormValues = Record<string, any>;

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function sameValue(a: unknown, b: unknown): boolean {
  // null / undefined / "" all mean "nothing entered"
  if (isBlank(a) && isBlank(b)) return true;
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

/**
 * Only the fields the user actually changed between `initial` (what the form
 * showed when it opened) and `current`. Saving just these keeps an edit from
 * overwriting columns changed elsewhere in the meantime — a stale or
 * incidentally-written form value no longer clobbers the database.
 */
export function diffChangedFields(initial: FormValues, current: FormValues): FormValues {
  const changed: FormValues = {};
  for (const key of Object.keys(current)) {
    if (!sameValue(initial[key], current[key])) changed[key] = current[key];
  }
  return changed;
}
