import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import { eqFilter } from "@/lib/reports/helpers";

// ============================================================
// Contract Services section — pre-built reports.
//
// Org-wide equivalent of the Included Services tab on the contract
// detail dialog: shows every bundled service on every contract against
// its actual completed visit count, instead of one contract at a time.
// ============================================================

export const CONTRACT_SERVICE_REPORTS: PrebuiltReportDef[] = [
  {
    key: "contract-service-usage",
    section: "service",
    name: "Contract Service Usage",
    description:
      "Shows bundled services included on each contract (e.g. 25 mowings) against actual completed visits, so you can see which contracts are running over.",
    filters: [
      {
        key: "contract_status",
        label: "Contract Status",
        type: "select",
        options: [
          { value: "draft", label: "Draft" },
          { value: "sent", label: "Sent" },
          { value: "signed", label: "Signed" },
          { value: "active", label: "Active" },
          { value: "expired", label: "Expired" },
          { value: "cancelled", label: "Cancelled" },
        ],
      },
      {
        key: "over_only",
        label: "Only show over-included",
        type: "select",
        options: [{ value: "true", label: "Yes" }],
      },
    ],
    notes: [
      "Visits used counts a completed visit only if it's linked to a job service matching this bundled service — same logic as the Included Services tab on the contract.",
    ],
    analysis: (params) => ({
      dataset: "rpt_contract_service_usage",
      columns: [
        "client_name",
        "contract_title",
        "contract_status",
        "service_name",
        "visits_included",
        "visits_used",
        "visits_remaining",
        "is_over",
      ],
      filters: [
        ...eqFilter("contract_status", params.contract_status),
        ...(params.over_only === "true" ? [{ column: "is_over", op: "eq" as const, value: true }] : []),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "client_name",
      sortDir: "asc",
    }),
  },
];
