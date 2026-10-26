"use client";

import { useState, useCallback, useRef } from "react";
import type { AddressParts, VerifyAddressResult } from "@/types/address-verification";

/**
 * Advisory address check for a single address field group.
 *
 * Deliberately not a TanStack mutation with a toast: nothing here interrupts a
 * save. The caller renders whatever comes back next to the field, and the user
 * accepts the suggestion or keeps what they typed. A Google-side failure just
 * leaves `state` at "idle" with an `error` the caller may ignore - a dead key
 * must never look like a bad address.
 *
 * Pairs with POST /api/crm/address/verify.
 */
export function addressKey(typed: AddressParts): string {
  return [typed.address, typed.city, typed.state, typed.zip].join("|").toLowerCase();
}

export function useVerifyAddress() {
  const [state, setState] = useState<"idle" | "checking" | "done">("idle");
  const [result, setResult] = useState<VerifyAddressResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The address the current `result` describes, so a stale reply is ignored. */
  const lastChecked = useRef<string>("");
  /** Key of the address `result` was produced for (state so consumers re-render). */
  const [resultKey, setResultKey] = useState<string>("");

  const reset = useCallback(() => {
    setState("idle");
    setResult(null);
    setError(null);
    lastChecked.current = "";
    setResultKey("");
  }, []);

  /** True only when the current verdict describes exactly this address. */
  const isCurrent = useCallback(
    (typed: AddressParts) => state === "done" && !!result && resultKey === addressKey(typed),
    [state, result, resultKey],
  );

  const verify = useCallback(async (typed: AddressParts) => {
    const key = addressKey(typed);
    // Nothing to check, or nothing changed since the last check.
    if (!typed.address?.trim() || key === lastChecked.current) return;
    lastChecked.current = key;
    setState("checking");
    setError(null);
    try {
      const res = await fetch("/api/crm/address/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(typed),
      });
      const data = (await res.json()) as VerifyAddressResult & { error?: string };
      // A later edit already superseded this request.
      if (lastChecked.current !== key) return;
      if (!res.ok || data.error) {
        setError(data.error ?? "Could not check this address");
        setState("idle");
        setResult(null);
        return;
      }
      setResult(data);
      setResultKey(key);
      setState("done");
    } catch {
      if (lastChecked.current !== key) return;
      setError("Could not reach the address checker");
      setState("idle");
      setResult(null);
    }
  }, []);

  return { state, result, error, verify, reset, isCurrent };
}
