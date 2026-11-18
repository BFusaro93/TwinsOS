"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { routesForCrew } from "@/components/crm/snow/snow-board-actions";
import type { SnowRoute } from "@/types/crm-jobs";

const NEW_ROUTE = "__new__";

/**
 * "Permanent" crew assignment in two steps on one row: pick the crew, then the Master Route to save
 * its stops onto (the crew's own routes plus any shared route). Unassigned needs no route and applies
 * at once; otherwise the assignment is applied when the route is picked.
 */
export function PermanentCrewPicker({
  crews,
  routes,
  onApply,
  triggerClassName = "h-7 w-36 text-xs",
}: {
  crews: { id: string; name: string }[];
  routes: SnowRoute[];
  onApply: (crewId: string | null, routeId: string | null) => void;
  triggerClassName?: string;
}) {
  const [crewId, setCrewId] = useState("");

  const options = crewId && crewId !== "none" ? routesForCrew(crewId, routes) : [];

  return (
    <>
      <Select
        value={crewId}
        onValueChange={(v) => {
          if (v === "none") { setCrewId(""); onApply(null, null); return; }
          setCrewId(v);
        }}
      >
        <SelectTrigger className={triggerClassName}><SelectValue placeholder="1. Assign crew…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {crews.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {crewId && (
        <Select
          value=""
          onValueChange={(v) => { const id = crewId; setCrewId(""); onApply(id, v === NEW_ROUTE ? null : v); }}
        >
          <SelectTrigger className={triggerClassName}><SelectValue placeholder="2. Save to route…" /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o.routeId ?? NEW_ROUTE} value={o.routeId ?? NEW_ROUTE}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </>
  );
}
