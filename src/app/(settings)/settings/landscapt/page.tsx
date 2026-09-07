"use client";

import { Suspense } from "react";
import { LandscaptSettingsTabs } from "@/components/settings/LandscaptSettingsTabs";

export default function LandscaptSettingsHubPage() {
  // LandscaptSettingsTabs reads ?tab= via useSearchParams, which Next requires
  // to sit under a Suspense boundary for the static prerender of this route
  // (the build for 33bf5e71 failed here).
  return (
    <Suspense>
      <LandscaptSettingsTabs />
    </Suspense>
  );
}
