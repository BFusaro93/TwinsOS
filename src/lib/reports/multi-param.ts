/**
 * Wire format for a multi-select report filter param.
 *
 * Choices are stored in ONE string (it rides in the URL, saved dashboards and the
 * run request). The old format was comma-joined, which broke any choice that itself
 * contains a comma ("Smith, John") — it split into two bogus values. The new format
 * starts with an ASCII unit separator (U+001F) and joins with it, so no real value
 * can collide. Reading stays backward compatible: a string without the leading
 * separator is a legacy comma-joined value (saved reports and bookmarked URLs).
 *
 * Pure (no imports) so the client filter bar and the server report handlers share it.
 */
const SEP = "\u001f";

export function decodeMultiParam(value: string | undefined | null): string[] {
  if (!value) return [];
  const parts = value.startsWith(SEP) ? value.split(SEP) : value.split(",");
  return parts.map((v) => v.trim()).filter(Boolean);
}

export function encodeMultiParam(values: string[]): string {
  const clean = values.map((v) => v.trim()).filter(Boolean);
  return clean.length === 0 ? "" : SEP + clean.join(SEP);
}
