"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePhotoAccess } from "../hooks/usePhotoAccess";
import { useCurrentUserStore } from "@/stores";

interface PhotoModuleGuardProps {
  children: React.ReactNode;
}

/**
 * Access gate for all photo module routes.
 * Waits for the user store to finish loading before deciding whether to redirect —
 * prevents hard-refresh false-redirects caused by the placeholder "viewer" user
 * that exists before useSyncCurrentUser resolves.
 */
export function PhotoModuleGuard({ children }: PhotoModuleGuardProps) {
  const { canAccess } = usePhotoAccess();
  const { currentUserLoaded } = useCurrentUserStore();
  const router = useRouter();

  useEffect(() => {
    if (currentUserLoaded && !canAccess) {
      router.replace("/home");
    }
  }, [canAccess, currentUserLoaded, router]);

  // Still loading — show spinner, don't redirect yet
  if (!currentUserLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-400">Checking access…</p>
      </div>
    );
  }

  return <>{children}</>;
}
