import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import { inFilter } from "@/lib/reports/helpers";

// ============================================================
// Field Upsells section — pre-built reports.
//
// A crew-submitted upsell is a crm_tickets row with category 'Upsell'. Its
// OUTCOME is deliberately not the ticket's own open/closed status — that only
// says whether the office has dealt with it. Whether it earned anything comes
// from the stage of the estimate it was linked to, which is where the real
// pipeline lives (see the rpt_upsells view).
// ============================================================

const OUTCOME_FILTER = {
  key: "outcome",
  label: "Outcome",
  type: "multiselect" as const,
  options: [
    { value: "Not quoted", label: "Not quoted" },
    { value: "Quoted", label: "Quoted (awaiting decision)" },
    { value: "Won", label: "Won" },
    { value: "Lost", label: "Lost" },
  ],
};

export const UPSELL_REPORTS: PrebuiltReportDef[] = [
  {
    key: "field-upsells",
    section: "service",
    name: "Field Upsells",
    description:
      "Every piece of work a crew flagged from the field, with the client, what they suggested, and whether it became a quote and a sale.",
    filters: [
      OUTCOME_FILTER,
      { key: "crew", label: "Crew", type: "multiselect", optionsSource: "crews" },
    ],
    notes: [
      "Outcome comes from the linked estimate's stage, not the ticket's status — a ticket can be closed without the work ever being quoted.",
      "'Not quoted' means no estimate has been linked to the ticket yet. Use Create estimate on the ticket to make that link in one step.",
      "Won Revenue counts only estimates that reached Accepted, Won or Invoiced, so summing it gives money actually sourced from the field rather than open pipeline.",
    ],
    analysis: (params) => ({
      dataset: "rpt_upsells",
      columns: [
        "ticket_number",
        "submitted_at",
        "client_name",
        "service_suggested",
        "submitted_by",
        "outcome",
        "estimate_number",
        "estimate_total_cents",
        "won_revenue_cents",
      ],
      filters: [
        ...inFilter("outcome", params.outcome),
        ...inFilter("crew_name", params.crew),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "submitted_at",
      sortDir: "desc",
    }),
  },
  {
    key: "upsell-conversion-by-crew",
    section: "service",
    name: "Upsell Conversion by Crew Member",
    description:
      "Who is spotting work in the field, and how much of it turns into money — suggestions submitted against revenue won.",
    filters: [
      OUTCOME_FILTER,
      { key: "crew", label: "Crew", type: "multiselect", optionsSource: "crews" },
    ],
    notes: [
      "Grouped by the person who submitted the suggestion, so it works whether crews share one login or each member has their own.",
      "Leave Outcome empty for the full picture: the row count is everything they submitted, Won Revenue is what came of it. Filter to Won to see only converted suggestions.",
      "Won Revenue is the linked estimate's total, so a suggestion that grew into a larger job is credited at what was actually sold.",
    ],
    analysis: (params) => ({
      dataset: "rpt_upsells",
      columns: [],
      filters: [
        ...inFilter("outcome", params.outcome),
        ...inFilter("crew_name", params.crew),
      ],
      groupBy: ["submitted_by"],
      aggregates: [
        { column: "*", fn: "count" },
        { column: "won_revenue_cents", fn: "sum" },
      ],
      sortColumn: "sum_won_revenue_cents",
      sortDir: "desc",
    }),
  },
];
