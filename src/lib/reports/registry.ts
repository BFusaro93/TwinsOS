import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import { ADDITIONAL_REPORTS } from "@/lib/reports/definitions/additions";
import { AUDIT_REPORTS } from "@/lib/reports/definitions/audits";
import { CHEMICAL_REPORTS } from "@/lib/reports/definitions/chemical-reports";
import { CLIENT_REPORTS } from "@/lib/reports/definitions/client-reports";
import { CONTRACT_SERVICE_REPORTS } from "@/lib/reports/definitions/contract-services";
import { ESTIMATE_REPORTS } from "@/lib/reports/definitions/estimates";
import { FINANCIAL_REPORTS } from "@/lib/reports/definitions/financial";
import { HOURS_VARIANCE_REPORTS } from "@/lib/reports/definitions/hours-variance";
import { JOB_COSTING_REPORTS } from "@/lib/reports/definitions/job-costing";
import { JOB_HOURS_REPORTS } from "@/lib/reports/definitions/job-hours";
import { LEAD_REPORTS } from "@/lib/reports/definitions/lead";
import { RECEIVABLES_REPORTS } from "@/lib/reports/definitions/receivables";
import { REVENUE_REPORTS } from "@/lib/reports/definitions/revenue";
import { SCHEDULE_LIST_REPORTS } from "@/lib/reports/definitions/schedule-lists";
import { SERVICE_REPORTS } from "@/lib/reports/definitions/service-reports";

export const ALL_REPORTS: PrebuiltReportDef[] = [
  ...AUDIT_REPORTS,
  ...CHEMICAL_REPORTS,
  ...CLIENT_REPORTS,
  ...CONTRACT_SERVICE_REPORTS,
  ...ESTIMATE_REPORTS,
  ...FINANCIAL_REPORTS,
  ...HOURS_VARIANCE_REPORTS,
  ...JOB_COSTING_REPORTS,
  ...JOB_HOURS_REPORTS,
  ...LEAD_REPORTS,
  ...RECEIVABLES_REPORTS,
  ...REVENUE_REPORTS,
  ...SCHEDULE_LIST_REPORTS,
  ...SERVICE_REPORTS,
  ...ADDITIONAL_REPORTS,
];

export const REPORT_MAP: Record<string, PrebuiltReportDef> = Object.fromEntries(
  ALL_REPORTS.map((r) => [r.key, r])
);

export function getReport(key: string): PrebuiltReportDef | undefined {
  return REPORT_MAP[key];
}
