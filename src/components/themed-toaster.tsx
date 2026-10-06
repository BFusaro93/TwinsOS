"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Toaster } from "sonner";
import { isDarkModeReady } from "@/lib/theme/dark-mode-routes";

/**
 * sonner doesn't read our `.dark` class, so hand it the theme. Same rule as
 * useChartColors: only follow the preference on dark-ready routes.
 */
export function ThemedToaster() {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const theme = isDarkModeReady(pathname) && resolvedTheme === "dark" ? "dark" : "light";
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      duration={4500}
    />
  );
}
