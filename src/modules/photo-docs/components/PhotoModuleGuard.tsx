"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAddonAccess } from "@/lib/hooks/use-module-access";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
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
  // Job Photos is a paid add-on (bundled on Growth/Enterprise and in a trial).
  // UI gate only — the photo tables themselves are not add-on-aware in RLS.
  const { allowed: hasAddon, isLoading: addonLoading } = useAddonAccess("job_photos");
  const { data: profile } = useCurrentProfile();
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
        <p className="text-sm text-slate-400 dark:text-neutral-500">Loading…</p>
      </div>
    );
  }

  if (!addonLoading && !hasAddon) {
    const isAdmin = profile?.role === "admin";
    return (
      <EmptyState
        icon={Camera}
        title="Job Photos is an add-on"
        description={
          "Before/after photo capture, annotations and the photo archive are part of the Job Photos add-on. " +
          (isAdmin
            ? "Add it from your subscription settings."
            : "Ask an admin to add Job Photos in Settings → Subscription.")
        }
        action={
          isAdmin ? (
            <Button asChild size="sm">
              <Link href="/settings?tab=subscription">View add-ons</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (!canAccess) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-400 dark:text-neutral-500">Checking access…</p>
      </div>
    );
  }

  return <>{children}</>;
}
