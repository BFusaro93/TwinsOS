"use client";

import { useTableRealtime } from "@/lib/hooks/use-realtime";

/**
 * Mounts one Supabase Realtime subscription per key business table and
 * invalidates the matching TanStack Query cache entry on any change.
 *
 * Mounted once at the dashboard layout level so there is exactly one channel
 * per table regardless of how many components read the same data.
 *
 * Renders nothing — pure side-effect component.
 */
export function RealtimeSync() {
  useTableRealtime("requisitions",          ["requisitions"]);
  useTableRealtime("purchase_orders",        ["purchase-orders"]);
  useTableRealtime("work_orders",            ["work-orders"]);
  useTableRealtime("assets",                 ["assets"]);
  useTableRealtime("vehicles",               ["vehicles"]);
  useTableRealtime("parts",                  ["parts"]);
  useTableRealtime("product_items",          ["products"]);
  useTableRealtime("projects",               ["projects"]);
  useTableRealtime("maintenance_requests",   ["requests"]);
  useTableRealtime("vendors",                ["vendors"]);
  useTableRealtime("pm_schedules",           ["pm-schedules"]);
  useTableRealtime("meter_readings",         ["meter-readings"]);

  return null;
}
