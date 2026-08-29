"use client";

import { useState, useEffect } from "react";
import { useOAuthWriteRoles, useSetOAuthWriteRoles } from "@/lib/hooks/use-oauth-write-roles";
import { CONFIGURABLE_WRITE_ROLES } from "@/lib/api/oauth";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

const ROLE_LABEL: Record<string, string> = {
  manager: "Manager",
  technician: "Technician",
  purchaser: "Purchaser",
  viewer: "Viewer",
};

/**
 * Lets an admin opt specific non-admin roles into write access when one of
 * their team signs in via the OAuth flow (src/app/oauth/authorize) --
 * admins always get write; every other role defaults to read-only unless
 * opted in here. Sits alongside OAuthConnectionsCard in Settings.
 */
export function OAuthWriteRolesCard() {
  const { data: savedRoles, isLoading } = useOAuthWriteRoles();
  const setRoles = useSetOAuthWriteRoles();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (savedRoles) setSelected(new Set(savedRoles));
  }, [savedRoles]);

  function toggle(role: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  const dirty = savedRoles !== undefined && JSON.stringify([...selected].sort()) !== JSON.stringify([...savedRoles].sort());

  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b px-6 py-4">
        <h3 className="text-sm font-semibold text-slate-900">OAuth Write Access</h3>
        <p className="mt-1 text-sm text-slate-500">
          Admins can always grant write access when connecting via OAuth sign-in. Opt additional roles in here — everyone else stays read-only.
        </p>
      </div>

      <div className="px-6 py-5">
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-4">
              {CONFIGURABLE_WRITE_ROLES.map((role) => (
                <label key={role} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <Checkbox checked={selected.has(role)} onCheckedChange={() => toggle(role)} />
                  {ROLE_LABEL[role]}
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                disabled={!dirty || setRoles.isPending}
                onClick={() => setRoles.mutate([...selected])}
              >
                Save
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
