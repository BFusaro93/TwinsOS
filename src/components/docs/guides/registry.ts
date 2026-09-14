import type { ComponentType } from "react";

import { ApiMcpGuide } from "@/components/docs/guides/api-mcp-guide";
import { ApprovalFlowsGuide } from "@/components/docs/guides/approval-flows-guide";
import { AutomationsGuide } from "@/components/docs/guides/automations-guide";
import { ClientPortalGuide } from "@/components/docs/guides/client-portal-guide";
import { ClientsGuide } from "@/components/docs/guides/clients-guide";
import { ContractsGuide } from "@/components/docs/guides/contracts-guide";
import { CrewAppGuide } from "@/components/docs/guides/crew-app-guide";
import { DamageCasesGuide } from "@/components/docs/guides/damage-cases-guide";
import { DispatchBoardGuide } from "@/components/docs/guides/dispatch-board-guide";
import { EstimatingGuide } from "@/components/docs/guides/estimating-guide";
import { FormsGuide } from "@/components/docs/guides/forms-guide";
import { ImportExportGuide } from "@/components/docs/guides/import-export-guide";
import { InventoryCostingGuide } from "@/components/docs/guides/inventory-costing-guide";
import { InvoicingGuide } from "@/components/docs/guides/invoicing-guide";
import { JobPhotosGuide } from "@/components/docs/guides/job-photos-guide";
import { JobsPackagesGuide } from "@/components/docs/guides/jobs-packages-guide";
import { MetersGuide } from "@/components/docs/guides/meters-guide";
import { NotificationPreferencesGuide } from "@/components/docs/guides/notification-preferences-guide";
import { OnlinePaymentsGuide } from "@/components/docs/guides/online-payments-guide";
import { PartsInventoryGuide } from "@/components/docs/guides/parts-inventory-guide";
import { PMSchedulesGuide } from "@/components/docs/guides/pm-schedules-guide";
import { ProductCatalogGuide } from "@/components/docs/guides/product-catalog-guide";
import { ProjectsGuide } from "@/components/docs/guides/projects-guide";
import { PurchaseOrdersGuide } from "@/components/docs/guides/purchase-orders-guide";
import { ReportCenterGuide } from "@/components/docs/guides/report-center-guide";
import { ReportsReferenceGuide } from "@/components/docs/guides/reports-reference-guide";
import { RequiredFieldsGuide } from "@/components/docs/guides/required-fields-guide";
import { SalesMeetingsGuide } from "@/components/docs/guides/sales-meetings-guide";
import { SamsaraGuide } from "@/components/docs/guides/samsara-guide";
import { ServicesPricingGuide } from "@/components/docs/guides/services-pricing-guide";
import { SmsOnboardingGuide } from "@/components/docs/guides/sms-onboarding-guide";
import { SnowGuide } from "@/components/docs/guides/snow-guide";
import { TicketsGuide } from "@/components/docs/guides/tickets-guide";
import { UsersRolesGuide } from "@/components/docs/guides/users-roles-guide";
import { WaitingListGuide } from "@/components/docs/guides/waiting-list-guide";
import { WorkOrdersGuide } from "@/components/docs/guides/work-orders-guide";
import { ZapierGuide } from "@/components/docs/guides/zapier-guide";

/**
 * Every long-form guide, keyed by slug. The guide bodies are plain server
 * components (not route files) so the same one can be rendered inside any
 * product shell — Equipt (/docs/<slug>), Landscapt (/crm/docs/<slug>) or
 * Settings (/settings/support/<slug>) — instead of always dragging the
 * reader into Settings. Keep in sync with DOC_GUIDES in @/lib/docs-guides.
 */
export const GUIDE_COMPONENTS: Record<string, ComponentType> = {
  "api-mcp-guide": ApiMcpGuide,
  "approval-flows-guide": ApprovalFlowsGuide,
  "automations-guide": AutomationsGuide,
  "client-portal-guide": ClientPortalGuide,
  "clients-guide": ClientsGuide,
  "contracts-guide": ContractsGuide,
  "crew-app-guide": CrewAppGuide,
  "damage-cases-guide": DamageCasesGuide,
  "dispatch-board-guide": DispatchBoardGuide,
  "estimating-guide": EstimatingGuide,
  "forms-guide": FormsGuide,
  "import-export-guide": ImportExportGuide,
  "inventory-costing-guide": InventoryCostingGuide,
  "invoicing-guide": InvoicingGuide,
  "job-photos-guide": JobPhotosGuide,
  "jobs-packages-guide": JobsPackagesGuide,
  "meters-guide": MetersGuide,
  "notification-preferences-guide": NotificationPreferencesGuide,
  "online-payments-guide": OnlinePaymentsGuide,
  "parts-inventory-guide": PartsInventoryGuide,
  "pm-schedules-guide": PMSchedulesGuide,
  "product-catalog-guide": ProductCatalogGuide,
  "projects-guide": ProjectsGuide,
  "purchase-orders-guide": PurchaseOrdersGuide,
  "report-center-guide": ReportCenterGuide,
  "reports-reference-guide": ReportsReferenceGuide,
  "required-fields-guide": RequiredFieldsGuide,
  "sales-meetings-guide": SalesMeetingsGuide,
  "samsara-guide": SamsaraGuide,
  "services-pricing-guide": ServicesPricingGuide,
  "sms-onboarding-guide": SmsOnboardingGuide,
  "snow-guide": SnowGuide,
  "tickets-guide": TicketsGuide,
  "users-roles-guide": UsersRolesGuide,
  "waiting-list-guide": WaitingListGuide,
  "work-orders-guide": WorkOrdersGuide,
  "zapier-guide": ZapierGuide,
};
