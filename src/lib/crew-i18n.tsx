"use client";

import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { es as dateFnsEs } from "date-fns/locale/es";
import type { Locale as DateFnsLocale } from "date-fns";
import { CREW_ES } from "@/lib/crew-i18n-es";

// English / Spanish for the crew pages' own wording. Keys are the English text
// itself, so a missing translation falls back to readable English. Only built-in
// labels are translated — job notes, client and service names, comments and
// anything else a person typed is data and is shown exactly as written.
//
// Language: the crew member's choice (saved on this device), else the browser's
// language. `t` is a plain function reading the active language; changing
// language remounts the crew pages (see CrewLocaleProvider) so every t(...) call
// re-reads it. The server always renders English — the choice only exists in the
// browser — and the provider switches after mount.

export type CrewLocale = "en" | "es";

const STORAGE_KEY = "crew.locale";

let current: CrewLocale = "en";

export function currentCrewLocale(): CrewLocale {
  return current;
}

/** BCP-47 tag for date/time formatting in the active language. */
export function crewIntlLocale(): string {
  return current === "es" ? "es-US" : "en-US";
}

/** date-fns locale for `format(...)` calls — undefined (English) or Spanish month/day names. */
export function crewDateLocale(): DateFnsLocale | undefined {
  return current === "es" ? dateFnsEs : undefined;
}

/** Translates `text` (English). `{name}` placeholders are filled from `vars` in either language. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const base = current === "es" ? (CREW_ES[text] ?? text) : text;
  if (!vars) return base;
  return base.replace(/\{(\w+)\}/g, (_match: string, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const LocaleContext = createContext<{ locale: CrewLocale; setLocale: (l: CrewLocale) => void }>({
  locale: "en",
  setLocale: () => {},
});

export function useCrewLocale() {
  return useContext(LocaleContext);
}

function initialLocale(): CrewLocale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {
    /* storage blocked — fall through to the browser language */
  }
  return (navigator.language ?? "en").toLowerCase().startsWith("es") ? "es" : "en";
}

export function CrewLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<CrewLocale>("en");

  useEffect(() => {
    const next = initialLocale();
    current = next;
    setLocaleState(next);
  }, []);

  const setLocale = useCallback((next: CrewLocale) => {
    current = next;
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice just won't survive a reload */
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  // Keyed so a change remounts everything below and re-runs every t().
  return (
    <LocaleContext.Provider value={value}>
      <Fragment key={locale}>{children}</Fragment>
    </LocaleContext.Provider>
  );
}

/** Español / English switch. Shows the language you would switch TO, in that language. */
export function CrewLanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useCrewLocale();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "es" ? "en" : "es")}
      className={className ?? "text-sm font-medium text-blue-600 dark:text-blue-400"}
    >
      {locale === "es" ? "English" : "Español"}
    </button>
  );
}
