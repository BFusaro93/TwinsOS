"use client";

import { EquiptSettingsTabs } from "@/components/settings/EquiptSettingsTabs";

// Same tabs the Settings shell serves at /settings/equipt, mounted here so the
// Equipt sidebar's Settings item keeps you in Equipt — mirroring Landscapt,
// which serves LandscaptSettingsTabs at both /crm/settings and
// /settings/landscapt. EquiptSettingsTabs gates itself to admins/managers, so
// the role check travels with the component to both mounts.
export default function EquiptSettingsPage() {
  return <EquiptSettingsTabs />;
}
