"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { isDarkModeReady } from "@/lib/theme/dark-mode-routes";

const LIGHT = {
  grid: "#f1f5f9",
  axis: "#94a3b8",
  label: "#475569",
  tooltipBorder: "#e2e8f0",
  tooltipBg: undefined as string | undefined,
  tooltipText: undefined as string | undefined,
};

const DARK = {
  grid: "#262626",
  axis: "#a3a3a3",
  label: "#d4d4d4",
  tooltipBorder: "#333333",
  tooltipBg: "#1b1b1b",
  tooltipText: "#f5f5f5",
};

/**
 * Recharts takes colors as props, not classes, so Tailwind's `dark:` can't
 * reach them. next-themes' `resolvedTheme` ignores `forcedTheme`, so also
 * require the route to be dark-ready — otherwise a stored "dark" would paint
 * dark chart chrome onto a page that is being forced light.
 */
export function useChartColors() {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  return isDarkModeReady(pathname) && resolvedTheme === "dark" ? DARK : LIGHT;
}
