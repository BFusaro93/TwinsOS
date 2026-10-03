/** Formats a US phone number as the user types: "5087931234" -> "(508) 793-1234" */
export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Comparison key for duplicate detection: the last 10 digits, so "1-555-123-4567",
 * "(555) 123-4567" and "5551234567" all collide. Numbers with fewer than 7
 * digits ("0", "n/a" junk, extensions) return null so they never match.
 */
export function phoneDedupeKey(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

/**
 * Normalizes a US-shaped phone to E.164 ("(508) 796-2940" -> "+15087962940").
 * 10-digit and 11-digit-with-leading-1 numbers are normalized; anything else
 * (international, partial, already "+"-prefixed) is returned as typed.
 */
export function toE164Us(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}
