"use client";

import { useEffect } from "react";
import { useCurrentUserStore } from "@/stores";
import { pushRecentItem } from "@/lib/recent-items";

/** Records a client (or lead) in the search "Recent" list once its detail view has loaded. */
export function useRecordRecentClient(
  client: { id: string; displayName: string; status: string; primaryPhone?: string | null; primaryEmail?: string | null } | null | undefined,
) {
  const userId = useCurrentUserStore((s) => s.currentUser.id);
  const id = client?.id;
  const displayName = client?.displayName;
  const status = client?.status;
  const sub = [client?.primaryPhone, client?.primaryEmail].filter(Boolean).join(" · ");
  useEffect(() => {
    if (!id || !displayName) return;
    pushRecentItem(userId, {
      kind: status === "lead" ? "lead" : "client",
      id,
      label: displayName,
      sub: sub || undefined,
      href: `/crm/clients/${id}`,
    });
  }, [userId, id, displayName, status, sub]);
}
