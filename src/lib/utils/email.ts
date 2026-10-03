/** Loose structural check (local@domain.tld) — catches typos like "a@b" or "x@", not deliverability. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
