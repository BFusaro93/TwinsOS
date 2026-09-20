/**
 * Shared vocabulary for the address check (see /api/crm/address/verify and the
 * address_verdict columns added in 20260919030000).
 */

export type AddressVerdict =
  /** Every component confirmed by Google. */
  | "confirmed"
  /** Deliverable, but Google inferred or couldn't confirm a component. */
  | "unconfirmed_but_plausible"
  /** Google couldn't place it — most likely a typo. */
  | "unconfirmed_and_suspicious"
  /** From the Geocoding fallback: matched, but only partially. */
  | "partial_match"
  /** Google returned no result at all. */
  | "not_found";

export interface AddressParts {
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface VerifyAddressResult {
  verdict: AddressVerdict;
  /** Google's normalized version. Identical to the input when nothing changed. */
  normalized: AddressParts;
  lat: number | null;
  lng: number | null;
  /** Which API answered — "validation" is authoritative, "geocode" is the fallback. */
  source: "validation" | "geocode";
}

/** True when the result is worth interrupting the user about. */
export function verdictNeedsAttention(v: AddressVerdict): boolean {
  return v === "unconfirmed_and_suspicious" || v === "not_found";
}

/** True when Google's normalized address differs from what was typed. */
export function normalizedDiffers(typed: AddressParts, normalized: AddressParts): boolean {
  const n = (v: string) => (v ?? "").trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ");
  // A blank the user left that Google filled in counts as a difference on
  // purpose — offering the completed address is the point.
  return (["address", "city", "state", "zip"] as const).some((k) => n(typed[k]) !== n(normalized[k]));
}
