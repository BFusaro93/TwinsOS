"use client";

import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { crewIntlLocale, currentCrewLocale, t } from "@/lib/crew-i18n";

interface TranslateResponse {
  translated: string;
  sameLanguage: boolean;
}

/** Cached per device so a note is only ever translated once per language. */
function cacheKey(target: string, text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `crew.tr:${target}:${text.length}:${h}`;
}

function readCache(key: string): TranslateResponse | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as TranslateResponse) : null;
  } catch {
    return null;
  }
}

/**
 * "Translate" under a note: shows the note in the crew member's language (the
 * one picked with the Español / English toggle) beneath the original, which is
 * never replaced. Plain text only — pass the note flattened.
 */
export function TranslateNote({ text }: { text: string }) {
  const target = currentCrewLocale();
  const [result, setResult] = useState<TranslateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const translate = useMutation({
    mutationFn: async (): Promise<TranslateResponse> => {
      const key = cacheKey(target, text);
      const cached = readCache(key);
      if (cached) return cached;
      const res = await fetch("/api/crm/crew/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Couldn't translate this right now.");
      try {
        window.localStorage.setItem(key, JSON.stringify(json));
      } catch {
        /* storage full or blocked — just translate again next time */
      }
      return json as TranslateResponse;
    },
    onSuccess: (r) => {
      setResult(r);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!text.trim()) return null;

  return (
    <div className="mt-2">
      {result ? (
        result.sameLanguage ? (
          <p className="text-xs text-muted-foreground">{target === "es" ? t("Already in Spanish") : t("Already in English")}</p>
        ) : (
          <div className="rounded-md bg-white/60 dark:bg-black/20 px-2.5 py-2" lang={crewIntlLocale()}>
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-neutral-300">{result.translated}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{t("Translated automatically")}</p>
          </div>
        )
      ) : (
        <button
          type="button"
          onClick={() => translate.mutate()}
          disabled={translate.isPending}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400"
        >
          {translate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
          {target === "es" ? t("Translate to Spanish") : t("Translate to English")}
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
