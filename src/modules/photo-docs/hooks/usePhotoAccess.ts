"use client";

import { useCurrentUserStore } from "@/stores";

export type PhotoPermissions = {
  canAccess: boolean;
  canUpload: boolean;
  canAnnotate: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  isCrew: boolean;        // technician with photo access
  isSales: boolean;       // manager with photo access
};

/**
 * Returns the current user's photo module permissions.
 * Reads from the Zustand currentUser store — no extra fetch needed.
 */
export function usePhotoAccess(): PhotoPermissions {
  const { currentUser } = useCurrentUserStore();
  const role = currentUser.role;

  // Admins always have full access regardless of the flag.
  // Drivers are auto-granted access (they upload job-site photos from the field).
  const isAdmin = role === "admin";
  const isDriver = role === "driver";

  // The photo_module_access flag is stored on the profile but surfaced on OrgUser
  // by the settings store loader. If not present, default false.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasFlag = isAdmin || isDriver || Boolean((currentUser as any).photoModuleAccess);

  if (!hasFlag) {
    return {
      canAccess: false,
      canUpload: false,
      canAnnotate: false,
      canDelete: false,
      isAdmin: false,
      isCrew: false,
      isSales: false,
    };
  }

  const isCrew = role === "technician";
  const isSales = role === "manager";
  const isViewer = role === "viewer" || role === "purchaser";

  return {
    canAccess: true,
    canUpload: isAdmin || isSales || isCrew || isDriver,
    canAnnotate: isAdmin || isSales,
    canDelete: isAdmin || isSales,
    isAdmin,
    isCrew,
    isSales,
    // Viewer / purchaser: can access + view, nothing else
    ...(isViewer ? { canUpload: false, canAnnotate: false, canDelete: false } : {}),
    // Driver: can upload from the field, no annotations or deletes
    ...(isDriver ? { canAnnotate: false, canDelete: false } : {}),
  };
}
