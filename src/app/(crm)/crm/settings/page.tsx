"use client";

import { Suspense } from "react";
import { LandscaptSettingsTabs } from "@/components/settings/LandscaptSettingsTabs";

export default function CRMSettingsPage() {
  // LandscaptSettingsTabs reads ?tab= via useSearchParams, which Next requires
  // to sit under a Suspense boundary for the static prerender of this route.
  return (
    <Suspense>
      <LandscaptSettingsTabs />
    </Suspense>
  );
}
