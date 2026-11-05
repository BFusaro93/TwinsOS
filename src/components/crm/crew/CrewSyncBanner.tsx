"use client";

import { t } from "@/lib/crew-i18n";
import { useEffect, useState } from "react";
import { useMutationState } from "@tanstack/react-query";
import { CloudOff } from "lucide-react";

/**
 * Without signal TanStack parks crew actions (Start Job, breaks, notes) until the phone is back
 * online. The buttons used to just spin with no explanation; this says the taps are kept and
 * will send. The tap time travels with each request (see crewTap), so a late sync still records
 * the right time.
 */
export function CrewSyncBanner() {
  const paused = useMutationState({
    filters: { status: "pending" },
    select: (m) => m.state.isPaused,
  }).filter(Boolean).length;
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online && paused === 0) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex items-center gap-2 bg-amber-100 dark:bg-amber-900/60 px-4 py-2 text-sm font-medium text-amber-900 dark:text-amber-200"
    >
      <CloudOff className="h-4 w-4 shrink-0" />
      {paused > 0
        ? paused === 1 ? t("No signal — 1 action saved on this phone, will send when signal returns. Keep this page open.") : t("No signal — {n} actions saved on this phone, will send when signal returns. Keep this page open.", { n: paused })
        : t("No signal — you can keep working; actions will send when signal returns. Keep this page open.")}
    </div>
  );
}
