import { KpiDashboard } from "@/components/operations/KpiDashboard";

/** Legacy Twins-only scorecard (AvB / QBO / Samsara / CRM-report sources).
 *  Internal-org gated in (reports)/layout.tsx. */
export default function TwinsKpisPage() {
  return <KpiDashboard />;
}
