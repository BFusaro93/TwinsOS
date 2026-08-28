"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!scriptLoadPromise) {
    scriptLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Turnstile"));
      document.head.appendChild(script);
    });
  }
  return scriptLoadPromise;
}

/**
 * Renders a Cloudflare Turnstile widget and reports the verification token.
 * Fails open (renders nothing, and tells the caller via onError) if the
 * script can't load, the widget can't render for this domain, or it never
 * produces a token — a CDN hiccup or a misconfigured/unregistered domain
 * shouldn't be able to permanently disable the Submit button with no
 * explanation. Previously only a script-load failure was caught: a
 * same-origin render failure (e.g. Cloudflare's "error-callback", which
 * fires for things like a domain not registered for this site key) was
 * never surfaced, so the widget silently rendered nothing while the caller
 * kept waiting forever for a token that was never coming.
 */
export function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
  onError,
}: {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fail = () => {
      if (cancelled) return;
      setFailed(true);
      onError?.();
    };
    // Defense in depth: if nothing has happened within a reasonable window
    // (no successful render, no error-callback fired), stop waiting rather
    // than leaving the caller blocked on a token that may never arrive.
    const timeout = setTimeout(fail, 10_000);
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => { clearTimeout(timeout); onVerify(token); },
          "expired-callback": () => onExpire?.(),
          "error-callback": () => { clearTimeout(timeout); fail(); },
        });
      })
      .catch(() => { clearTimeout(timeout); fail(); });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (failed) return null;
  return <div ref={containerRef} />;
}
