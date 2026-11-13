"use client";

import { MasterRouteBuilder } from "@/components/crm/snow/MasterRouteBuilder";

/**
 * Settings → Services → Snow Routes. The editor itself lives with the Snow
 * Dispatch board (Master Routes button); this renders the same builder so
 * there is one editor, not two.
 */
export function SnowRoutesEditor() {
  return (
    <div className="px-1">
      <MasterRouteBuilder />
    </div>
  );
}
