"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { isDarkModeReady } from "@/lib/theme/dark-mode-routes";

/**
 * Pages print in place (docs "Download PDF", daily load list, invoices), so
 * paper must always be light. Tailwind's `dark:` variants key off the `.dark`
 * class, which a print media query can't undo — drop it for the duration of
 * the print and restore it after.
 */
function PrintLightGuard() {
  useEffect(() => {
    const root = document.documentElement;
    let hadDark = false;
    const before = () => {
      if (root.classList.contains("dark")) {
        hadDark = true;
        root.classList.remove("dark");
      }
    };
    const after = () => {
      if (hadDark) root.classList.add("dark");
      hadDark = false;
    };
    const mql = window.matchMedia("print");
    const onChange = (e: MediaQueryListEvent) => (e.matches ? before() : after());
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    mql.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      mql.removeEventListener("change", onChange);
    };
  }, []);
  return null;
}

/**
 * Class-based theming (Tailwind `darkMode: ["class"]`). The stored
 * preference is kept everywhere, but routes that haven't been converted yet
 * are forced to light — see dark-mode-routes.ts.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      storageKey="landscapt-theme"
      forcedTheme={isDarkModeReady(pathname) ? undefined : "light"}
    >
      <PrintLightGuard />
      {children}
    </NextThemesProvider>
  );
}
