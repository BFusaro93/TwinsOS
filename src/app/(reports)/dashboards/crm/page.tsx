/**
 * CRM Report page — renders the latest Service Autopilot summary in an iframe.
 * The iframe loads /api/crm-report which fetches fresh HTML from Supabase.
 */

import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "CRM Report | Equipt",
};

export const revalidate = 0;

async function getLastUpdated(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_reports")
    .select("updated_at")
    .eq("id", "latest")
    .single();
  return data?.updated_at ?? null;
}

export default async function CRMReportPage() {
  const updatedAt = await getLastUpdated();

  const formattedDate = updatedAt
    ? new Date(updatedAt).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      })
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Thin header bar showing last updated */}
      <div
        style={{ background: "#60ab45" }}
        className="flex shrink-0 items-center justify-between px-5 py-2 text-sm text-white"
      >
        <span className="font-semibold tracking-tight">
          CRM Summary — Service Autopilot
        </span>
        {formattedDate && (
          <span className="text-xs opacity-80">
            Last updated: {formattedDate} ET
          </span>
        )}
      </div>

      {/* Full-height iframe — loads /api/crm-report */}
      <iframe
        src="/api/crm-report"
        className="w-full flex-1 border-0"
        title="CRM Report"
      />
    </div>
  );
}
