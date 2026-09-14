import type { DashboardPanel, VisualSpec } from "@/types/crm-reports";

/** Builds a new dashboard panel from a Graphics Library item's visual — a
 *  snapshot copy, same "copy not reference" convention as panelFromSavedReport
 *  (src/components/crm/reports/report-center/DashboardBuilder.tsx). */
export function panelFromGraphic(name: string, visual: VisualSpec): DashboardPanel {
  return {
    id: crypto.randomUUID(),
    title: name,
    size: "half",
    visual,
  };
}
