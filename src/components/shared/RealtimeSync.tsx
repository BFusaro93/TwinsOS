"use client";

import { useTableRealtime } from "@/lib/hooks/use-realtime";

/** Tables Landscapt (CRM) pages also read: the shared catalog, vendors and projects. */
function SharedTablesRealtime() {
  useTableRealtime("product_items",          ["products"]);
  useTableRealtime("projects",               ["projects"]);
  useTableRealtime("vendors",                ["vendors"]);
  return null;
}

/** Equipt-only tables (procurement and CMMS). Landscapt pages never list these. */
function EquiptTablesRealtime() {
  useTableRealtime("requisitions",          ["requisitions"]);
  useTableRealtime("purchase_orders",        ["purchase-orders"]);
  useTableRealtime("work_orders",            ["work-orders"]);
  useTableRealtime("assets",                 ["assets"]);
  useTableRealtime("vehicles",               ["vehicles"]);
  useTableRealtime("parts",                  ["parts"]);
  useTableRealtime("maintenance_requests",   ["requests"]);
  useTableRealtime("pm_schedules",           ["pm-schedules"]);
  useTableRealtime("meter_readings",         ["meter-readings"]);
  return null;
}

/**
 * Mounts one Supabase Realtime subscription per key business table and
 * invalidates the matching TanStack Query cache entry on any change.
 *
 * Mounted once at each app layout so there is exactly one channel per table
 * regardless of how many components read the same data.
 *
 * `scope="equipt"` (default) subscribes to every table. `scope="shared"` is for
 * layouts that are not Equipt (Landscapt CRM, reports, settings, photos, tools):
 * it subscribes only to the tables those pages also read. Every subscribed table
 * costs the database an authorization check per change per open tab, and Equipt
 * tables take the most writes after visits, so a CRM tab should not pay for them.
 *
 * Renders nothing — pure side-effect component.
 */
export function RealtimeSync({ scope = "equipt" }: { scope?: "equipt" | "shared" }) {
  return (
    <>
      <SharedTablesRealtime />
      {scope === "equipt" ? <EquiptTablesRealtime /> : null}
    </>
  );
}
