"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useCurrentUserStore } from "@/stores";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useModuleAccess } from "@/lib/hooks/use-module-access";
import { LANDSCAPT_TAB_PERMISSIONS } from "@/lib/permissions/settings-access";
import {
  SETTINGS_AREA_LABELS,
  SETTINGS_SEARCH_INDEX,
  settingsEntryHref,
  type SettingsArea,
  type SettingsSearchEntry,
} from "@/lib/settings-search";

export const OPEN_SETTINGS_SEARCH_EVENT = "open-settings-search";

/** Opens the settings search from anywhere in the settings shell (the sidebar button uses this). */
export function openSettingsSearch() {
  window.dispatchEvent(new Event(OPEN_SETTINGS_SEARCH_EVENT));
}

/**
 * "Search settings" palette. Mounted once in the settings layout; the sidebar button opens it. (No
 * keyboard shortcut: Cmd/Ctrl+K already opens the global search in the top bar.) Only lists settings the signed-in user can actually reach (same rules as the sidebar and
 * each hub's tab list), so a result never leads to an access-denied page.
 */
export function SettingsSearchDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { currentUser } = useCurrentUserStore();
  const { isAdmin, roleId, can } = usePermissions();
  const { allowed: hasEquipt } = useModuleAccess("equipt");

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SETTINGS_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SETTINGS_SEARCH_EVENT, onOpen);
  }, []);

  const entries = useMemo(() => {
    const areaVisible: Record<SettingsArea, boolean> = {
      master: isAdmin || currentUser.role === "admin",
      equipt: currentUser.role === "admin" || currentUser.role === "manager",
      landscapt: isAdmin || roleId !== null,
    };
    return SETTINGS_SEARCH_INDEX.filter((e) => {
      if (!areaVisible[e.area]) return false;
      if (e.area === "landscapt") {
        const required = LANDSCAPT_TAB_PERMISSIONS[e.tab];
        return !required || can(required);
      }
      if (e.area === "equipt" && !hasEquipt) return e.tab !== "integrations" && e.tab !== "request_portal";
      return true;
    });
  }, [isAdmin, roleId, can, currentUser.role, hasEquipt]);

  const groups = useMemo(() => {
    const out: { area: SettingsArea; items: SettingsSearchEntry[] }[] = [];
    (["landscapt", "equipt", "master"] as SettingsArea[]).forEach((area) => {
      const items = entries.filter((e) => e.area === area);
      if (items.length) out.push({ area, items });
    });
    return out;
  }, [entries]);

  function go(e: SettingsSearchEntry) {
    setOpen(false);
    router.push(settingsEntryHref(e));
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search settings, e.g. invoice numbering, time zone, QuickBooks…" />
      <CommandList className="max-h-none flex-1">
        <CommandEmpty>No settings match that search.</CommandEmpty>
        {groups.map(({ area, items }) => (
          <CommandGroup
            key={area}
            heading={area === "equipt" && !hasEquipt ? "Purchasing" : SETTINGS_AREA_LABELS[area]}
          >
            {items.map((e) => (
              <CommandItem
                key={`${e.area}:${e.tab}:${e.title}`}
                // cmdk matches on this string: title + breadcrumb + the extra words people might type.
                value={`${e.title} ${e.tabLabel} ${SETTINGS_AREA_LABELS[e.area]} ${e.keywords ?? ""}`}
                onSelect={() => go(e)}
                className="flex-col items-start gap-0.5"
              >
                <span className="text-sm font-medium">{e.title}</span>
                <span className="text-xs text-muted-foreground">
                  {SETTINGS_AREA_LABELS[e.area]} › {e.tabLabel}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
