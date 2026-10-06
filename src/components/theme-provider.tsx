"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { isDarkModeReady } from "@/lib/theme/dark-mode-routes";

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
      {children}
    </NextThemesProvider>
  );
}
