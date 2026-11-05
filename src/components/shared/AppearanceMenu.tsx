"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isDarkModeReady } from "@/lib/theme/dark-mode-routes";
import { UI_SCALE_OPTIONS, isUiScale, useDisplaySize } from "@/lib/hooks/use-display-size";
import { cn } from "@/lib/utils";

/**
 * One top-bar button for the personal look-and-feel settings:
 *  - Theme (Light / Dark / System) — only on routes converted to dark mode;
 *    the rest are forced light, so offering it there would do nothing.
 *  - Display size (80 / 90 / 100%) — only on desktop screens with a mouse,
 *    where it is applied (see use-display-size.ts).
 * When neither applies (a phone on a not-yet-dark page) the button isn't shown.
 *
 * Always mounted by the TopBar, because it is also what applies the saved
 * display size to the page.
 */
export function AppearanceMenu() {
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { scale, setScale } = useDisplaySize();
  // next-themes can't know the stored theme during SSR; wait for mount so the
  // icon doesn't hydrate-mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const darkReady = isDarkModeReady(pathname);
  const Icon = !mounted ? Sun : resolvedTheme === "dark" && darkReady ? Moon : Sun;

  return (
    // Without the theme section the only content is desktop-only display size,
    // so the whole button hides below lg / on touch.
    <div className={cn(!darkReady && "hidden lg:block touch:hidden")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" aria-label="Appearance" title="Appearance">
            <Icon className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {darkReady && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={mounted ? theme : "light"} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="light"><Sun className="mr-2 h-4 w-4" />Light</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark"><Moon className="mr-2 h-4 w-4" />Dark</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system"><Monitor className="mr-2 h-4 w-4" />System</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </>
          )}
          {/* Desktop only: below lg (and on touch) the scale isn't applied. */}
          <div className="hidden lg:block touch:hidden">
            {darkReady && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground">Display size</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={scale} onValueChange={(v) => { if (isUiScale(v)) setScale(v); }}>
              {UI_SCALE_OPTIONS.map((s) => (
                <DropdownMenuRadioItem key={s.value} value={s.value}>{s.label}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
