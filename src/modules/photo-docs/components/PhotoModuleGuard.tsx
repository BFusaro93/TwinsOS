"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePhotoAccess } from "../hooks/usePhotoAccess";

interface PhotoModuleGuardProps {
  children: React.ReactNode;
}

/**
 * Access gate for all photo module routes.
 * Redirects to /dashboard if the current user does not have photo_module_access.
 */
export function PhotoModuleGuard({ children }: PhotoModuleGuardProps) {
  const { canAccess } = usePhotoAccess();
  const router = useRouter();

  useEffect(() => {
    if (!canAccess) {
      router.replace("/home");
    }
  }, [canAccess, router]);

  if (!canAccess) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-400">Checking access…</p>
      </div>
    );
  }

  return <>{children}</>;
}
