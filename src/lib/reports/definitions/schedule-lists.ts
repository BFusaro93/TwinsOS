import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import type { AnalysisFilter } from "@/types/crm-reports";

// ============================================================
// Schedule Lists section — pre-built reports.
// ============================================================

export const SCHEDULE_LIST_REPORTS: PrebuiltReportDef[] = [
  {
    key: "employee-directory",
    section: "schedule_lists",
    name: "Employee Directory",
    description: "Shows employee contact info, employment status, and emergency contacts.",
    filters: [
      { key: "active_only", label: "Active Only", type: "checkbox", defaultValue: "true" },
    ],
    analysis: (params) => {
      const filters: AnalysisFilter[] = [];
      if (params.active_only !== "false") {
        filters.push({ column: "is_active", op: "eq", value: true });
      }
      return {
        dataset: "rpt_employees",
        columns: [
          "full_name",
          "employment_status",
          "user_type",
          "phone",
          "cell_phone",
          "email",
          "city",
          "state",
          "emergency_contact",
          "emergency_phone",
        ],
        filters,
        groupBy: [],
        aggregates: [],
        sortColumn: "full_name",
        sortDir: "asc",
      };
    },
  },
  {
    key: "contractor-phone-list",
    section: "schedule_lists",
    name: "Contractor Phone List",
    description: "Shows contact info for everyone with contractor employment status.",
    filters: [],
    analysis: () => ({
      dataset: "rpt_employees",
      columns: ["full_name", "phone", "cell_phone", "email", "city", "state", "is_active"],
      filters: [{ column: "employment_status", op: "eq", value: "contractor" }],
      groupBy: [],
      aggregates: [],
      sortColumn: "full_name",
      sortDir: "asc",
    }),
  },
  {
    key: "vendor-contact-list",
    section: "schedule_lists",
    name: "Vendor Contact List",
    description: "Shows vendors and subcontractors with their contact information.",
    filters: [],
    analysis: () => ({
      dataset: "rpt_vendors",
      columns: ["name", "contact_name", "phone", "email", "address", "vendor_type", "is_active"],
      filters: [],
      groupBy: [],
      aggregates: [],
      sortColumn: "name",
      sortDir: "asc",
    }),
  },
  {
    key: "inventory-product-list",
    section: "schedule_lists",
    name: "Inventory Product List",
    description: "Shows inventory products with cost, price, and stock levels.",
    filters: [],
    analysis: () => ({
      dataset: "rpt_products",
      columns: [
        "name",
        "part_number",
        "category",
        "unit_cost",
        "price",
        "quantity_on_hand",
        "minimum_stock",
        "vendor_name",
      ],
      filters: [{ column: "is_inventory", op: "eq", value: true }],
      groupBy: [],
      aggregates: [],
      sortColumn: "name",
      sortDir: "asc",
    }),
  },
  {
    key: "non-inventory-product-list",
    section: "schedule_lists",
    name: "Non-Inventory Product List",
    description: "Shows non-inventory products with cost and price.",
    filters: [],
    analysis: () => ({
      dataset: "rpt_products",
      columns: ["name", "part_number", "category", "unit_cost", "price", "vendor_name"],
      filters: [{ column: "is_inventory", op: "eq", value: false }],
      groupBy: [],
      aggregates: [],
      sortColumn: "name",
      sortDir: "asc",
    }),
  },
  {
    key: "call-ahead-required",
    section: "schedule_lists",
    name: "Call Ahead Required",
    description: "Scheduled jobs that require a call-ahead reminder before the crew arrives.",
    filters: [],
    analysis: () => ({
      dataset: "rpt_jobs",
      columns: [
        "scheduled_date",
        "client_name",
        "client_phone",
        "service_address",
        "service_city",
        "crew_name",
        "service_names",
      ],
      filters: [
        { column: "call_ahead", op: "eq", value: true },
        { column: "status", op: "eq", value: "scheduled" },
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "scheduled_date",
      sortDir: "asc",
    }),
  },
  {
    key: "service-price-list",
    section: "schedule_lists",
    name: "Service Price List",
    description: "Shows the service catalog with rates, production rates, and targets.",
    filters: [
      { key: "active_only", label: "Active Only", type: "checkbox", defaultValue: "true" },
    ],
    analysis: (params) => {
      const filters: AnalysisFilter[] = [];
      if (params.active_only !== "false") {
        filters.push({ column: "is_active", op: "eq", value: true });
      }
      return {
        dataset: "rpt_services",
        columns: [
          "name",
          "code",
          "category",
          "unit",
          "default_rate_cents",
          "production_rate_sqft_per_hr",
          "target_rate_cents_per_hr",
          "is_taxable",
        ],
        filters,
        groupBy: [],
        aggregates: [],
        sortColumn: "name",
        sortDir: "asc",
      };
    },
  },
];
