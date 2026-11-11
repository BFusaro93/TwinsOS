"use client";

import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { currentCrewLocale, t } from "@/lib/crew-i18n";

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

type Target = "en" | "es";

/**
 * "Translate" under a note: shows the note in Spanish and/or English beneath the original, which is
 * never replaced. Both directions are always offered — the app's own language only decides which
 * link comes first — so a supervisor running the app in English can still read a note in Spanish.
 * Plain text only — pass the note flattened.
 */
export function TranslateNote({ text }: { text: string }) {
  const own: Target = currentCrewLocale();
  const other: Target = own === "es" ? "en" : "es";
  const [results, setResults] = useState<Partial<Record<Target, TranslateResponse>>>({});
  const [error, setError] = useState<string | null>(null);

  const translate = useMutation({
    mutationFn: async (target: Target): Promise<{ target: Target; res: TranslateResponse }> => {
      const key = cacheKey(target, text);
      const cached = readCache(key);
      if (cached) return { target, res: cached };
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
      return { target, res: json as TranslateResponse };
    },
    onSuccess: ({ target, res }) => {
      setResults((prev) => ({ ...prev, [target]: res }));
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!text.trim()) return null;

  const linkLabel = (target: Target) => (target === "es" ? t("Translate to Spanish") : t("Translate to English"));
  const pendingTarget = translate.isPending ? translate.variables : null;

  return (
    <div className="mt-2">
      {([own, other] as Target[]).map((target) => {
        const result = results[target];
        if (!result) return null;
        return result.sameLanguage ? (
          <p key={target} className="text-xs text-muted-foreground">{target === "es" ? t("Already in Spanish") : t("Already in English")}</p>
        ) : (
          <div key={target} className="mb-1.5 rounded-md bg-white/60 dark:bg-black/20 px-2.5 py-2" lang={target === "es" ? "es-US" : "en-US"}>
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-neutral-300">{result.translated}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{t("Translated automatically")}</p>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-x-4">
        {([own, other] as Target[])
          .filter((target) => !results[target])
          .map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => translate.mutate(target)}
              disabled={translate.isPending}
              className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400"
            >
              {pendingTarget === target ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
              {linkLabel(target)}
            </button>
          ))}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
