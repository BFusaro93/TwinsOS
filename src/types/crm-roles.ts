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
          sa_dashboard: "SA Dashboard",
          company_reports: "Company Reports",
          crm_reports_home: "CRM Reports",
          scheduling_reports_home: "Scheduling Reports",
          accounting_reports_home: "Accounting Reports",
          sales_manager_reports: "Sales Manager Reports",
          sales_rep_reports: "Sales Rep Reports",
          view_report_center: "View Report Center",
          manage_report_center: "Manage Report Center",
        },
      },
      other_access: {
        label: "Other Access",
        permissions: {
          allow_roles_access: "Allow Roles Access",
          websites: "Websites",
          export_lists: "Export Lists",
          quickbooks_resync: "QuickBooks Resync",
          bulk_edit_products: "Bulk Edit Products",
          estimate_accepted_alert: "Estimate Accepted Alert",
          imports: "Imports",
        },
      },
      marketplace_access: {
        label: "Marketplace Access",
        permissions: {
          view_marketplace: "View Marketplace",
        },
      },
    },
  },

  crm: {
    label: "CRM",
    sections: {
      client_access: {
        label: "Client Access",
        permissions: {
          client_list: "Client List",
          client_activate_deactivate: "Activate/Deactivate",
          client_add: "Add Client",
          client_allow_edit: "Allow Edit",
          client_allow_delete: "Allow Cancel/Deactivate",
          client_bulk_edit: "Bulk Edit",
          client_bulk_schedule: "Bulk Schedule",
          client_bulk_create: "Bulk Create",
          client_marketing: "Marketing",
          client_add_contract: "Add Contract",
          client_payment_alerts: "Payment Alerts",
        },
      },
      client_access_cont: {
        label: "Client Access (cont.)",
        permissions: {
          client_portal_ticket_alerts: "Client Portal Ticket Alerts",
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
          lead_bulk_edit: "Bulk Edit",
          lead_bulk_create: "Bulk Create",
          lead_estimates: "Estimates",
          lead_add: "Add Lead",
          lead_convert_close: "Convert/Close",
        },
      },
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
      tickets_access: {
        label: "Tickets Access",
        permissions: {
          tickets_view_modify: "View/Modify Tickets",
          tickets_add_notes: "Add Notes",
          tickets_add_calls: "Add Calls",
          tickets_view_modify_email_integrations: "View/Modify Email Integrations",
        },
      },
      tags: {
        label: "Tags",
        permissions: {
          tags_create_tag: "Create Tag",
          tags_create_tag_category: "Create Tag Category",
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
      auto_assist_access: {
        label: "Auto Assist Access",
        permissions: {
          auto_assist_create_modify_categories: "Create/Modify Assist Categories",
          auto_assist_create_modify: "Create/Modify Assists",
          auto_assist_view: "View Assists",
        },
      },
      forms: {
        label: "Forms",
        permissions: {
          forms_view_submit: "View/Submit Forms",
          forms_edit: "Edit Forms",
          forms_view_office_only_fields: "View Office-Only Fields",
          forms_get_alerts: "Get Form Alerts",
        },
      },
      email_activity: {
        label: "Email Activity",
        permissions: {
          email_activity_view: "View Email Activity",
          email_activity_send: "Send Emails",
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
          sched_calendar: "Calendar",
          sched_dispatch_board: "Dispatch Board",
          sched_waiting_list: "Waiting List",
          sched_teams: "Teams",
          sched_add_modify_projects: "Add/Modify Projects",
          sched_asset_tracking: "Asset Tracking",
          sched_view_edit_asset_purchase_info: "View/Edit Asset Purchase Info",
          sched_view_edit_asset_forms: "View/Edit Asset Forms",
          sched_get_schedule_alerts: "Get Schedule Alerts",
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
      job_access: {
        label: "Job Access",
        permissions: {
          job_view: "View Jobs",
          job_add: "Add Job",
          job_cancel: "Cancel Job",
          job_pause_restart: "Pause/Restart Job",
          job_delete_comments: "Delete Job Comments",
          job_edit_all_comments: "Edit All Job Comments",
          job_add_remove_custom_package_line_items: "Add/Remove Custom Package Line Items",
        },
      },
      company_directory: {
        label: "Company Directory",
        permissions: {
          company_dir_view: "View Company Directory",
          company_dir_view_upcoming_schedule: "View Upcoming Schedule",
        },
      },
      employee_access: {
        label: "Employee Access",
        permissions: {
          emp_manage: "Manage Employees",
          emp_view_info: "View Employee Information",
          emp_view_attachments: "View Attachments",
          emp_view_rating: "View Rating",
          emp_view_time_off: "View Time Off",
          emp_view_resource_notes: "View Resource Notes",
          emp_view_customer: "View Customer",
          emp_view_custom_fields: "View Custom Fields",
          emp_view_user_settings: "View User Settings",
          emp_view_license_info: "View License Info",
          emp_view_alerts: "View Alerts",
          emp_resolve_time_off_request: "Resolve Time Off Request",
          emp_can_log_others_time_off: "Can Log Others Time Off",
          emp_can_approve_own_time_off: "Can Approve Own Time Off Request",
          emp_add_edit_applicants: "Add / Edit Applicants",
          emp_view_applicants: "View Applicants",
        },
      },
      employee_access_cont: {
        label: "Employee Access (cont.)",
        permissions: {
          emp_add: "Add Employee",
          emp_edit: "Edit Employee",
          emp_edit_photo: "Edit Photo",
          emp_add_remove_tag: "Add/Remove Tag",
          emp_add_time_off: "Add Time Off",
          emp_edit_time_off: "Edit Time Off",
          emp_add_edit_complaint: "Add/Edit Complaint",
          emp_add_edit_compliment: "Add/Edit Compliment",
          emp_delete_complaint: "Delete Complaint",
          emp_delete_compliment: "Delete Compliment",
          emp_modify_note_expiration: "Modify Note Expiration",
          emp_view_default_schedule: "View Default Schedule",
          emp_edit_default_schedule: "Edit Default Schedule",
          emp_view_upcoming_schedule: "View Upcoming Schedule",
          emp_override_scheduled_days: "Override Scheduled Days",
          emp_view_scheduled_work: "View Scheduled Work",
        },
      },
      vendor_access: {
        label: "Vendor Access",
        permissions: {
          vendor_manage: "Manage Vendors",
          vendor_view_info: "View Vendor Information",
          vendor_view_attachments: "View Attachments",
          vendor_view_rating: "View Rating",
          vendor_view_resource_notes: "View Resource Notes",
          vendor_view_customer: "View Customer",
          vendor_view_custom_fields: "View Custom Fields",
          vendor_view_user_settings: "View User Settings",
          vendor_view_alerts: "View Alerts",
        },
      },
      vendor_access_cont: {
        label: "Vendor Access (cont.)",
        permissions: {
          vendor_add: "Add Vendor",
          vendor_edit: "Edit Vendor",
          vendor_edit_photo: "Edit Photo",
          vendor_add_remove_tag: "Add/Remove Tag",
          vendor_add_time_off: "Add Time Off",
          vendor_edit_time_off: "Edit Time Off",
          vendor_add_edit_complaint: "Add/Edit Complaint",
          vendor_add_edit_compliment: "Add/Edit Compliment",
          vendor_delete_complaint: "Delete Complaint",
          vendor_delete_compliment: "Delete Compliment",
          vendor_modify_note_expiration: "Modify Note Expiration",
          vendor_view_default_schedule: "View Default Schedule",
          vendor_edit_default_schedule: "Edit Default Schedule",
          vendor_view_upcoming_schedule: "View Upcoming Schedule",
          vendor_override_scheduled_days: "Override Scheduled Days",
          vendor_view_scheduled_work: "View Scheduled Work",
        },
      },
      chemical_tracking: {
        label: "Chemical Tracking",
        permissions: {
          chem_add_edit_usage: "Add | Edit Usage",
          chem_create_uom: "Create UoM",
          chem_create_mix: "Create Mix",
          chem_create_application_method: "Create Application Method",
          chem_create_target: "Create Target",
          chem_create_custom_field: "Create Custom Field",
        },
      },
    },
  },

  accounting: {
    label: "Accounting",
    sections: {
      accounting_access: {
        label: "Accounting Access",
        permissions: {
          acct_view_client_invoices: "View Client Invoices",
          acct_view_invoice_list: "View Invoice List",
          acct_add_modify_invoices: "Add/Modify Invoices",
          acct_view_client_payments: "View Client Payments",
          acct_view_payment_list: "View Payment List",
          acct_add_modify_payments: "Add/Modify Payments",
          acct_delete_card_payments: "Delete Card Payments",
          acct_delete_ach_payments: "Delete ACH Payments",
          acct_view_expenses: "View Expenses",
          acct_add_modify_expenses: "Add/Modify Expenses",
          acct_process_cc_refunds_voids: "Process CC Payment Refunds/Voids",
          acct_view_credits: "View Credits",
          acct_add_modify_credits: "Add/Modify Credits",
          acct_view_adjust_balances: "View Adjust Balances",
          acct_add_modify_adjust_balances: "Add/Modify Adjust Balances",
          acct_view_timesheets: "View Timesheets",
          acct_create_invoices: "Create Invoices",
          acct_view_usps_jobs: "View USPS Jobs",
          acct_qb_reconciliation: "QB Reconciliation",
          acct_add_modify_purchase_orders: "Add/Modify Purchase Orders",
          acct_view_bulk_price_update: "View Bulk Price Update",
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
      statistic_access: {
        label: "Statistic Access",
        permissions: {
          stat_add_edit_type: "Add/Edit Statistic Type",
          stat_add_edit: "Add/Edit Statistic",
          stat_remove_type: "Remove Statistic Type",
          stat_remove: "Remove Statistic",
        },
      },
      payroll_access: {
        label: "Payroll Access",
        permissions: {
          payroll_show_pay_rate: "Show Pay Rate",
          payroll_show_wage_burden: "Show Wage Burden",
          payroll_can_approve_timesheets: "Can Approve Timesheets",
          payroll_can_unapprove_timesheets: "Can Unapprove Timesheets",
          payroll_view_report: "View Payroll Report",
          payroll_view_wall_clock: "View Wall Clock",
          payroll_employee_view_payroll: "Employee - View Payroll",
          payroll_vendor_view_payroll: "Vendor - View Payroll",
        },
      },
    },
  },

  mobile: {
    label: "Mobile",
    sections: {
      mobile_access: {
        label: "Mobile Access",
        permissions: {
          mobile_view_jobs: "View Jobs",
          mobile_complete_jobs: "Complete Jobs",
          mobile_add_notes: "Add Notes",
          mobile_add_photos: "Add Photos",
          mobile_time_clock: "Time Clock",
          mobile_view_client_info: "View Client Info",
          mobile_view_route: "View Route",
          mobile_gps_tracking: "GPS Tracking",
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
