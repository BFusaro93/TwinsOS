// ── permission structure ──────────────────────────────────────────────────────
// Each entry: { tab → sections → { permissions } }
// Stored in DB as flat JSONB: { "client_list": true, "add_client": false, ... }

export interface PermissionSection {
  label: string;
  permissions: Record<string, string>; // key → display label
}

export interface PermissionTab {
  label: string;
  sections: Record<string, PermissionSection>;
}

export const PERMISSION_TABS: Record<string, PermissionTab> = {
  home: {
    label: "Home",
    sections: {
      settings_access: {
        label: "Settings Access",
        permissions: {
          account_settings: "Account Settings",
          company_settings: "Company Settings",
          crm_settings: "CRM Settings",
          scheduling_settings: "Scheduling Settings",
          accounting_settings: "Accounting Settings",
        },
      },
      report_access: {
        label: "Report Access",
        permissions: {
          view_report_center: "View Report Center",
          manage_report_center: "Manage Report Center",
          payroll_report: "View & Edit Payroll Report",
        },
      },
      dashboard_access: {
        label: "Dashboard Access",
        permissions: {
          // Which built-in dashboards this role sees (sidebar, overview and
          // direct URL — see DASHBOARDS_NAV / GATED_DASHBOARD_ROUTES).
          // Admins always see every dashboard; any other login needs an
          // active role with the key (no role = no gated dashboards).
          // Twins-only legacy dashboards stay on the internal-org check and
          // aren't listed here.
          view_dashboard_equipt: "View Equipt Dashboard",
          view_dashboard_myday: "View Landscapt My Day",
          view_dashboard_reports: "View Reports Dashboard",
          view_dashboard_kpis: "View KPI Scorecard",
          view_dashboard_driver_safety: "View Driver Safety Scores",
          view_dashboard_company_report: "View Company Report",
          view_dashboard_social_media: "View Social Media",
          // Admins and Managers can always edit; this lets a lesser role
          // (e.g. a social media manager) log weeks and edit goals/platforms.
          // Enforced in the DB by can_edit_social_media(). Kept right after
          // the view key so the two read as a pair.
          social_media_edit: "Social Media: Enter & Edit Data",
          view_dashboard_custom: "View Custom Dashboards",
          view_dashboard_job_costing: "View Job Costing (Dashboards)",
          view_dashboard_estimate_builder: "View Estimate Builder (Dashboards)",
          view_dashboard_calculators: "View Calculators (Dashboards)",
        },
      },
      other_access: {
        label: "Other Access",
        permissions: {
          allow_roles_access: "Allow Roles Access",
          export_lists: "Export Lists",
          quickbooks_resync: "QuickBooks Resync",
          bulk_edit_products: "Bulk Edit Products",
          imports: "Imports",
        },
      },
    },
  },

  clients_leads: {
    label: "Clients & Leads",
    sections: {
      client_access: {
        label: "Client Access",
        permissions: {
          client_list: "Client List",
          client_activate_deactivate: "Cancel / Reactivate Clients",
          client_add: "Add Client",
          client_allow_edit: "Allow Edit",
          client_allow_delete: "Merge Clients (also Cancel / Reactivate)",
          client_bulk_edit: "Bulk Edit",
          client_bulk_create: "Bulk Create",
          client_add_contract: "Add Contract",
        },
      },
      client_access_cont: {
        label: "Client Access (cont.)",
        permissions: {
          client_view_balance: "View Balance",
          client_view_history: "View History",
          client_view_notes: "View Notes",
          client_view_contacts: "View Contacts",
          client_view_billing: "View Billing",
          client_view_credit_card: "View Credit Card #'s",
          client_reset_portal_password: "Reset Client Portal Password",
        },
      },
      lead_access: {
        label: "Lead Access",
        permissions: {
          lead_list: "Lead List",
          lead_allow_edit: "Allow Edit",
          lead_allow_delete: "Allow Close as Lost",
          lead_bulk_create: "Bulk Create",
          lead_estimates: "Add an Estimate",
          lead_add: "Add Lead",
          lead_convert_close: "Convert/Close",
        },
      },
    },
  },

  sales: {
    label: "Sales",
    sections: {
      estimate_access: {
        label: "Estimate Access",
        permissions: {
          estimate_list: "View Estimates",
          estimate_add: "Add Estimate",
          estimate_edit: "Edit Estimate",
          estimate_send: "Send Estimate",
        },
      },
      contract_access: {
        label: "Contract Access",
        permissions: {
          contract_list: "View Contracts",
          contract_add: "Add Contract",
          contract_edit: "Edit Contract",
          contract_delete: "Delete Contract",
          contract_create_invoices: "Create Invoices from Contracts",
        },
      },
      campaign_access: {
        label: "Sales Campaign Access",
        permissions: {
          campaign_list: "View Campaigns",
          campaign_add: "Add Campaign",
          campaign_edit: "Edit Campaign",
          campaign_delete: "Delete Campaign",
          campaign_send: "Send/Launch Campaign",
        },
      },
      sales_meeting_access: {
        label: "Sales Meeting Access",
        permissions: {
          sales_meeting_list: "View Sales Meetings",
          sales_meeting_add: "Add Sales Meeting",
          sales_meeting_edit: "Edit Sales Meeting",
        },
      },
    },
  },

  communication: {
    label: "Tickets & Communication",
    sections: {
      tickets_access: {
        label: "Tickets Access",
        permissions: {
          tickets_view_modify: "View/Modify Tickets",
          tickets_add_notes: "Add Notes",
          tickets_add_calls: "Add Calls",
        },
      },
      tags: {
        label: "Tags",
        permissions: {
          tags_create_tag: "Create Tag",
        },
      },
      automation_access: {
        label: "Automation Access",
        permissions: {
          automation_create_modify: "Create/Modify Automation",
          automation_view: "View Automation",
          automation_stop: "Stop Automation",
          automation_view_tags: "View Automation Tags",
          automation_add_tags: "Add Automation Tags",
        },
      },
      forms: {
        label: "Forms",
        permissions: {
          forms_view_submit: "View/Submit Forms",
          forms_edit: "Edit Forms",
        },
      },
      email_activity: {
        label: "Email & Text Activity",
        permissions: {
          email_activity_view: "View Email Activity",
          email_activity_send: "Send Emails",
          // Separate from email on purpose: a text is governed by TCPA
          // consent and costs the org per message, so "may email a client"
          // does not imply "may text one". Enforced server-side in
          // /api/crm/clients/[clientId]/send-sms, not only in the UI.
          sms_send: "Send Texts",
        },
      },
      document_template_access: {
        label: "Document Template Access",
        permissions: {
          document_template_list: "View Document Templates",
          document_template_add: "Add Document Template",
          document_template_edit: "Edit Document Template",
          document_template_delete: "Delete Document Template",
        },
      },
    },
  },

  reports: {
    label: "Reports",
    sections: {
      crm_reports: {
        label: "CRM Reports",
        permissions: {
          crm_rpt_client_balance: "Client Balance",
          crm_rpt_client_contracts: "Client Contracts",
          crm_rpt_client_referral: "Client Referral",
          crm_rpt_new_clients: "New Clients Report",
          crm_rpt_new_client_count: "New Client Count Report",
          crm_rpt_cancellation_count: "Cancellation Count Report",
          crm_rpt_clients_by_completed_jobs: "Clients Report by Completed Jobs",
          crm_rpt_client_method_of_payment: "Client Method of Payment",
          crm_rpt_terminations: "Terminations Report",
          crm_rpt_client_contact_list: "Client Contact List",
          crm_rpt_client_phone_list: "Client Phone List",
          crm_rpt_client_timeline: "Client Timeline Report",
          crm_rpt_lead_timeline: "Lead Timeline Report",
          admin_rpt_audit_log: "Audit Log",
          admin_rpt_security_audit: "Security & Access Audit",
        },
      },
      crm_reports_cont: {
        label: "CRM Reports (cont.)",
        permissions: {
          crm_rpt_sales_summary_by_source: "Sales Summary by Source",
          crm_rpt_closed_leads_summary: "Closed Leads Summary",
          crm_rpt_lead_aging_summary: "Lead Aging Summary",
          crm_rpt_new_leads: "New Leads Report",
          crm_rpt_estimates_by_stage: "Estimates by Stage",
          crm_rpt_won_estimates_by_service: "Won Estimates by Service",
          crm_rpt_won_estimates_service_products: "Won Estimates Service Products",
          crm_rpt_won_estimates_service_value: "Won Estimates Service Value",
          crm_rpt_forms_summary: "Forms Summary",
          crm_rpt_company_scorecard: "Company Scorecard",
        },
      },
      scheduling_reports: {
        label: "Scheduling Reports",
        permissions: {
          sched_rpt_job_cost_summary: "Job Cost Summary",
          sched_rpt_package_summary: "Package Summary Report",
          sched_rpt_client_count_by_service: "Client Count by Service",
          sched_rpt_chemical_tracking: "Chemical Tracking",
          sched_rpt_over_under: "Over / Under Report",
          sched_rpt_backlog_services: "Backlog Services",
          sched_rpt_sales_count_by_sales_rep: "Sales Count by Sales Rep",
          sched_rpt_client_services: "Client Services Report",
          sched_rpt_paused_services: "Paused Services Report",
          sched_rpt_cogs: "Cost of Goods Sold Report",
          sched_rpt_job_costing: "Job Costing",
          sched_rpt_sales_by_date_sold: "Sales by Date Sold",
          sched_rpt_field_upsells: "Field Upsells",
          sched_rpt_upsell_conversion: "Upsell Conversion by Crew Member",
        },
      },
      scheduling_reports_cont: {
        label: "Scheduling Reports (cont.)",
        permissions: {
          sched_rpt_contractor_phone_list: "Contractor Phone List",
          sched_rpt_vendor_contact_list: "Vendor Contact List",
          sched_rpt_non_inventory_product_list: "Non-Inventory Product List",
          sched_rpt_inventory_product_list: "Inventory Product List",
          sched_rpt_job_hours_summary: "Job Hours Summary",
          sched_rpt_product_service_usage: "Product and Service Usage",
          sched_rpt_visits: "Visits Report",
          sched_rpt_employee_directory: "Employee Directory",
          sched_rpt_revenue_budgeted_hours: "Revenue and Budgeted Hours Projection",
          sched_rpt_custom_package_renewal: "Custom Package Renewal Report",
        },
      },
      accounting_reports: {
        label: "Accounting Reports",
        permissions: {
          acct_rpt_invoiced_income_by_client: "Invoiced Income by Client",
          acct_rpt_invoices_with_balances: "Invoices with Balances",
          acct_rpt_pre_payments: "Pre-Payments",
          acct_rpt_sales_tax: "Sales Tax Report",
          acct_rpt_ar_aging: "A/R Aging Report",
          acct_rpt_ar_aging_snapshot: "A/R Aging Snapshot",
          acct_rpt_profit_loss_cash: "Profit / Loss - Cash Basis",
          acct_rpt_profit_loss_accrual: "Profit / Loss - Accrual Basis",
          acct_rpt_revenue_by_service_summary: "Revenue by Service Summary",
          acct_rpt_revenue_per_service: "Revenue per Service",
        },
      },
      accounting_reports_cont: {
        label: "Accounting Reports (cont.)",
        permissions: {
          acct_rpt_daily_production: "Daily Production",
          acct_rpt_payment_audit_summary: "Payment Audit Summary",
          acct_rpt_invoice_audit_summary: "Invoice Audit Summary",
          acct_rpt_sales_activity_summary: "Sales Activity Summary",
          acct_rpt_sales_activity_detail: "Sales Activity Detail",
          acct_rpt_revenue_by_postal_code: "Revenue by Postal Code",
          acct_rpt_booked_revenue_by_sales_rep: "Booked Revenue by Sales Rep",
          acct_rpt_income_not_invoiced: "Income not Invoiced",
          acct_rpt_unapplied_payments: "Unapplied Payments",
          acct_rpt_sales_commission_export: "Sales Commission Export",
        },
      },
    },
  },

  scheduling: {
    label: "Scheduling",
    sections: {
      scheduling_access: {
        label: "Scheduling Access",
        permissions: {
          sched_dispatch_board: "Dispatch Board",
          sched_waiting_list: "Waiting List",
          sched_teams: "Teams",
          sched_add_modify_projects: "Add/Modify Projects",
          sched_visit_price_qty: "Change Visit Price & Quantity",
        },
      },
      warranty_access: {
        label: "Warranty Access",
        permissions: {
          warranty_view: "View Warranties",
          warranty_manage: "Add/Edit/Void Warranties",
        },
      },
      snow_dispatch_access: {
        label: "Snow Dispatch Access",
        permissions: {
          snow_dispatch_view: "View Snow Dispatch",
          snow_dispatch_manage: "Manage Snow Dispatch",
        },
      },
      job_access: {
        label: "Job Access",
        permissions: {
          job_view: "View Jobs",
          job_add: "Add Job",
          job_cancel: "Cancel Job",
          job_add_remove_custom_package_line_items: "Add/Remove Custom Package Line Items",
        },
      },
      service_access: {
        label: "Service Access",
        permissions: {
          service_list: "View Services",
          service_add: "Add Service",
          service_edit: "Edit Service",
          service_delete: "Delete Service",
          service_bulk_price: "Bulk Update Catalog Prices",
          pricing_adjustment_run: "Run Price Adjustments",
        },
      },
      package_access: {
        label: "Package Access",
        permissions: {
          package_list: "View Packages",
          package_add: "Add Package",
          package_edit: "Edit Package",
          package_delete: "Delete Package",
        },
      },
      chemical_tracking: {
        label: "Chemical Tracking",
        permissions: {
          chem_add_edit_usage: "Add | Edit Usage",
          chem_send_application_notice: "Email Application Notice",
          chem_create_uom: "Create UoM",
          chem_create_application_method: "Create Application Method",
          chem_create_target: "Create Target",
        },
      },
    },
  },

  team: {
    label: "Team",
    sections: {
      employee_access: {
        label: "Employee Access",
        permissions: {
          emp_manage: "Manage Employees",
          emp_view_info: "View Employee Information",
          emp_view_resource_notes: "View Resource Notes",
          emp_view_user_settings: "View User Settings",
          emp_view_license_info: "View License Info",
        },
      },
      employee_access_cont: {
        label: "Employee Access (cont.)",
        permissions: {
          emp_add: "Add Employee",
          emp_edit: "Edit Employee",
          emp_add_remove_tag: "Add/Remove Tag",
        },
      },
      vendor_access: {
        label: "Vendor Access",
        permissions: {
          vendor_view_resource_notes: "View Resource Notes",
        },
      },
      payroll_access: {
        label: "Payroll Access",
        permissions: {
          payroll_show_pay_rate: "Show Pay Rate",
          payroll_show_wage_burden: "Show Wage Burden",
        },
      },
    },
  },

  accounting: {
    label: "Accounting",
    sections: {
      requisition_access: {
        label: "Requisition Access",
        permissions: {
          requisition_list: "View Requisitions",
          requisition_add: "Add Requisition",
          requisition_edit: "Edit Requisition",
          requisition_delete: "Delete Requisition",
        },
      },
      commission_access: {
        label: "Commission Access",
        permissions: {
          commission_view_own: "View My Own Commissions",
          commission_view: "View All Reps' Commission Earnings & Statements",
          commission_manage: "Manage Commission Plans & Statements",
        },
      },
      snow_invoicing_access: {
        label: "Snow Invoicing Access",
        permissions: {
          snow_invoicing_view: "View Snow Invoicing",
          snow_invoicing_generate: "Generate Snow Invoices",
        },
      },
      accounting_access: {
        label: "Accounting Access",
        permissions: {
          acct_view_invoice_list: "View Invoice List",
          acct_add_modify_invoices: "Add/Modify Invoices",
          acct_send_invoices: "Email Invoices",
          acct_send_statements: "Email Account Statements",
          acct_view_payment_list: "View Payment List",
          acct_add_modify_payments: "Add/Modify Payments",
          acct_delete_card_payments: "Delete Card Payments",
          acct_delete_ach_payments: "Delete ACH Payments",
          acct_process_cc_refunds_voids: "Process CC Payment Refunds/Voids",
          acct_add_modify_credits: "Add/Modify Credits",
          acct_qb_reconciliation: "QB Reconciliation",
          acct_add_modify_purchase_orders: "Add/Modify Purchase Orders",
        },
      },
    },
  },
};

// Helper: all permission keys in a tab
export function allKeysInTab(tabKey: string): string[] {
  const tab = PERMISSION_TABS[tabKey];
  if (!tab) return [];
  return Object.values(tab.sections).flatMap((s) => Object.keys(s.permissions));
}

// Helper: all permission keys in a section
/**
 * Hover help for a permission's label in the role dialog, for the
 * permissions whose name alone doesn't say what they unlock. Keyed by permission key;
 * a key with no entry shows no help line.
 */
export const PERMISSION_HELP: Record<string, string> = {
  account_settings:
    "Master Account Settings: Organization, Branding, Subscription and Integrations. Users and API keys stay admin-only.",
  company_settings: "Settings > General (company info).",
  crm_settings:
    "Settings > Clients, Chemical Tracking, Required Fields, Import / Export, Integrations and Client Portal.",
  scheduling_settings: "Settings > Services (service prices and setup).",
  accounting_settings: "Settings > Estimates and Accounting.",
  client_activate_deactivate: "Cancel and reactivate clients. Does not include merging.",
  client_allow_delete:
    "Cancel and reactivate clients, and merge duplicate clients. There is no permanent delete.",
  lead_allow_delete: "Close a lead as lost.",
  client_view_credit_card: "Shows a client's saved card (type and last four digits) and its Autopay status.",
  payroll_show_pay_rate: "Shows employees' hourly pay rates on payroll screens.",
  payroll_show_wage_burden: "Shows the fully loaded labor cost (wage burden) on payroll screens.",
  social_media_edit: "Log weekly social media numbers and edit goals and platforms. Admins and Managers always can.",
  // Reports & dashboards
  view_report_center: "Open the Report Center, run reports, and view saved custom reports and dashboards.",
  manage_report_center: "Create and edit custom reports, schedule report emails, and edit the KPI Scorecard.",
  payroll_report: "Open the Payroll report and edit crew punch times and paid breaks. Pay rates still need their own permission below.",
  view_dashboard_equipt: "Equipt dashboard: work orders, purchasing and asset management.",
  view_dashboard_myday: "Landscapt My Day: the user's daily schedule and tasks.",
  view_dashboard_reports: "Landscapt's built-in reporting dashboard (a dashboard, separate from the Report Center).",
  view_dashboard_kpis: "KPI Scorecard: customizable KPIs computed live from Landscapt data.",
  view_dashboard_driver_safety: "Driver Safety Scores (Samsara driver scoring).",
  view_dashboard_company_report: "Company Report: sales, operations and A/R computed live.",
  view_dashboard_social_media: "Social Media dashboard: weekly reach, engagement, followers and leads by platform.",
  view_dashboard_custom: "Custom dashboards built in the Report Center. Crew logins see only those flagged visible to crew.",
  view_dashboard_job_costing: "The Job Costing page under Dashboards.",
  view_dashboard_estimate_builder: "The Estimate Builder page under Dashboards.",
  view_dashboard_calculators: "The Calculators page under Dashboards.",
  // Other access
  allow_roles_access: "Add and delete roles on the Roles page. Everyone can view roles, and only admins can change what a role allows.",
  export_lists: "Export lists and tables to a file (Dispatch Board, Contracts and other import/export menus).",
  imports: "Import records from a file, such as clients and leads.",
  quickbooks_resync: "Re-send a client, invoice or payment to QuickBooks and use the QuickBooks resync tools in Settings.",
  bulk_edit_products: "Edit many products at once in the products catalog.",
  client_add_contract: "Shows the \"Add a Contract\" button on a client's page. It starts a service contract, not a contact person.",
  client_allow_edit: "Edit a client's details (clients only; leads use the Lead Access \"Allow Edit\").",
  lead_allow_edit: "Edit a lead's details (leads only; clients use the Client Access \"Allow Edit\").",
  lead_convert_close: "Convert a lead into a client, or close it as lost.",
  // Payments
  acct_process_cc_refunds_voids: "Refund or void a payment. Any of the three refund and delete payment permissions lets a user refund.",
  acct_delete_card_payments: "Refund a payment, and delete payment records. Deleting is blocked for payments taken through the card processor or already refunded.",
  acct_delete_ach_payments: "Refund a payment, and delete payment records. Same as the card version; holding either lets a user delete any payment record.",
  acct_add_modify_credits: "Add, edit and remove account credits, which are not money the client paid.",
  // Pricing
  sched_visit_price_qty: "Change the price and quantity on a scheduled visit from the Dispatch Board.",
  service_bulk_price: "Update prices across the service catalog in one step (Bulk Prices).",
  pricing_adjustment_run: "Run a price adjustment: preview, apply and undo price changes across services.",
  // Scheduling & jobs
  sched_teams: "Create and manage crews (teams) and their members.",
  sched_waiting_list: "Open the Waiting List and schedule waiting-list jobs.",
  sched_add_modify_projects: "Add and change projects, including the contract amount.",
  job_add_remove_custom_package_line_items: "Add or remove services on a package job; without it package jobs can't be changed.",
  // Tickets, automation, email
  tickets_view_modify: "Opens Tickets and Calls, and lets the user change tickets.",
  automation_stop: "Stop a running automation.",
  tags_create_tag: "Create new tags while tagging a client (otherwise only existing tags can be picked).",
  email_activity_send: "Send an email to a client from the Dispatch Board, a client page or a ticket.",
  // Team, chemical
  emp_manage: "Manage employees (the Manage actions on the Employees list), beyond Add and Edit.",
  emp_view_user_settings: "Shows the User Settings tab when viewing an employee.",
  chem_add_edit_usage: "Record and edit chemical applications on visits.",
  chem_create_uom: "Create new units of measure (volume and area units) in Chemical Tracking settings.",
};

export function allKeysInSection(tabKey: string, sectionKey: string): string[] {
  return Object.keys(PERMISSION_TABS[tabKey]?.sections[sectionKey]?.permissions ?? {});
}

// ── types ─────────────────────────────────────────────────────────────────────

export type Permissions = Record<string, boolean>;

export interface CRMRole {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  permissions: Permissions;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}
