import AsyncStorage from '@react-native-async-storage/async-storage';
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createContext, useContext } from 'react';

import { ES } from '@/lib/i18n-es';

// English / Spanish for the crew app's own wording. Keys are the English text
// itself, so a missing translation falls back to readable English instead of a
// blank or a key. Only the app's built-in labels are translated — anything
// typed by the office or the customer (job notes, client and service names,
// comments) is data and is shown exactly as written.
//
// Language: whatever the user picked in the app, else the phone's language.
// Switching remounts the screen tree (see LocaleProvider) so every plain
// t(...) call re-reads the new language without each component subscribing.

export type Locale = 'en' | 'es';

const STORAGE_KEY = 'crew.locale';

function deviceLocale(): Locale {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en';
    return tag.toLowerCase().startsWith('es') ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

let current: Locale = deviceLocale();

export function currentLocale(): Locale {
  return current;
}

/** BCP-47 tag for date/time formatting in the active language. */
export function intlLocale(): string {
  return current === 'es' ? 'es-US' : 'en-US';
}

/**
 * Translates `text` (English) for the active language. `{name}` placeholders are
 * filled from `vars` in either language, so word order can differ in Spanish.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const base = current === 'es' ? (ES[text] ?? text) : text;
  if (!vars) return base;
  return base.replace(/\{(\w+)\}/g, (_match: string, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: 'en', setLocale: () => {} });

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(current);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (cancelled || (saved !== 'en' && saved !== 'es')) return;
        current = saved;
        setLocaleState(saved);
      })
      .catch(() => {
        /* no saved choice — stay on the device language */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    current = next;
    setLocaleState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      /* the choice just won't survive a restart */
    });
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  // Keyed so a language change remounts everything below and re-runs every t().
  return (
    <LocaleContext.Provider value={value}>
      <Fragment key={locale}>{children}</Fragment>
    </LocaleContext.Provider>
  );
}
