"use client";

import { useEffect, useRef } from "react";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * Loads org settings from the database into the Zustand store on mount.
 * Render this once near the root of the authenticated layout so that
 * settings (company address, brand color, logo, etc.) are available
 * globally — not just when the user visits the Settings page.
 */
export function SettingsLoader() {
  const { data: remoteSettings } = useOrgSettings();
  const { loadFromRemote } = useSettingsStore();
  const seeded = useRef(false);

  useEffect(() => {
    if (!remoteSettings || seeded.current) return;
    seeded.current = true;
    loadFromRemote({
      orgName: remoteSettings.name,
      brandColor: remoteSettings.brandColor,
      address: remoteSettings.address,
      taxRatePercent: remoteSettings.taxRatePercent,
      costMethod: remoteSettings.costMethod,
      portalEnabled: remoteSettings.portalEnabled,
      ...((remoteSettings.customizations as Record<string, unknown>) ?? {}),
    } as Parameters<typeof loadFromRemote>[0]);
  }, [remoteSettings, loadFromRemote]);

  return null;
}
