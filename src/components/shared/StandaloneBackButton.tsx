"use client";

import { useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Installed (home-screen) mode has no browser chrome, so there is no back
// button — a detail page, a PDF or any other navigation would be a dead end.
// iOS reports standalone through navigator.standalone, everything else through
// the display-mode media query.
function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot() {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

// Top-level landing pages — nothing meaningful to go back to from them.
const ROOT_PATHS = new Set(["/home", "/crm/home", "/equipt/home", "/crm/crew"]);

export function StandaloneBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const standalone = useSyncExternalStore(subscribe, getSnapshot, () => false);

  if (!standalone || ROOT_PATHS.has(pathname)) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Go back"
      onClick={() => router.back()}
      className="shrink-0 text-slate-500"
    >
      <ArrowLeft className="h-5 w-5" />
    </Button>
  );
}
