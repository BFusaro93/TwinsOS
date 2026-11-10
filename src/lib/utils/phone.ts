/** Formats a US phone number as the user types: "5087931234" -> "(508) 793-1234" */
export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Drops a trailing extension ("508-555-1234 x12", "(508) 555-1234 ext. 7",
 * "5085551234#3", "...,12") so it isn't read as part of the number. Mirrors the
 * SQL phone_last10() (20261230000230_phone_last10_strip_extension.sql).
 */
export function stripPhoneExtension(value: string): string {
  return value.replace(/\s*(?:,|;|#|extension|ext\.?|x)\s*\d{1,6}\s*$/i, "");
}

/**
 * Comparison key for duplicate detection: the last 10 digits, so "1-555-123-4567",
 * "(555) 123-4567" and "5551234567" all collide. Numbers with fewer than 7
 * digits ("0", "n/a" junk) return null so they never match; an extension is
 * dropped first.
 */
export function phoneDedupeKey(value: string | null | undefined): string | null {
  const digits = stripPhoneExtension(value ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

/**
 * Normalizes a US-shaped phone to E.164 ("(508) 796-2940" -> "+15087962940").
 * 10-digit and 11-digit-with-leading-1 numbers are normalized; anything else
 * (international, partial) is returned as typed, except that a "+"-prefixed
 * number loses its spaces/punctuation. A trailing extension is dropped.
 */
export function toE164Us(value: string | null | undefined): string | null {
  // Twilio can't dial an extension; text the number itself.
  const raw = stripPhoneExtension((value ?? "").trim()).trim();
  if (!raw) return null;
  // Already international: just drop the spacing/punctuation E.164 forbids.
  if (raw.startsWith("+")) return `+${raw.replace(/\D/g, "")}`;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw;
}
