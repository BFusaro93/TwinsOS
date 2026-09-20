"use client";

import { AlertTriangle, Check, Loader2 } from "lucide-react";
import type { AddressParts, VerifyAddressResult } from "@/types/address-verification";
import { normalizedDiffers, verdictNeedsAttention } from "@/types/address-verification";

/**
 * The advisory line that sits under an address field group.
 *
 * One component for all three entry points (client service address, property
 * address, crew starting address) so they can't drift into saying different
 * things about the same verdict - the same mistake the dispatch board and the
 * route optimizer made about resolving an address in the first place.
 *
 * Never blocks. The strongest thing it does is offer a corrected address the
 * user can click; rural and new-construction addresses legitimately fail the
 * check, and Google being down is not the user's problem to solve mid-form.
 */
export function AddressSuggestion({
  typed,
  state,
  result,
  onAccept,
}: {
  typed: AddressParts;
  state: "idle" | "checking" | "done";
  result: VerifyAddressResult | null;
  onAccept: (normalized: AddressParts) => void;
}) {
  if (state === "checking") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking address...
      </p>
    );
  }
  if (state !== "done" || !result) return null;

  // A confirmed address is a real place as typed, so Google preferring its own
  // abbreviation ("Amphitheatre Parkway" -> "Amphitheatre Pkwy") is not worth a
  // prompt. Corrections that matter - a wrong street suffix like
  // "Birchwood Ln" -> "Birchwood Dr" - come back as plausible, not confirmed.
  const differs = result.verdict !== "confirmed" && normalizedDiffers(typed, result.normalized);
  const line = [result.normalized.address, result.normalized.city, result.normalized.state, result.normalized.zip]
    .filter(Boolean)
    .join(", ");

  if (verdictNeedsAttention(result.verdict)) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-amber-700">
        <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
        <span>
          Google couldn&apos;t confirm this address. Double-check it - a crew will be
          sent here. You can save it as typed.
        </span>
      </p>
    );
  }

  if (differs) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <span>Did you mean</span>
        <button
          type="button"
          onClick={() => onAccept(result.normalized)}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-800 underline decoration-dotted hover:bg-slate-200"
        >
          {line}
        </button>
        <span>?</span>
      </p>
    );
  }

  return (
    <p className="flex items-center gap-1.5 text-xs text-emerald-600">
      <Check className="h-3 w-3" />
      {result.source === "validation" ? "Address confirmed" : "Address found"}
    </p>
  );
}
