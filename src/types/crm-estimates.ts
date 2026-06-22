export type EstimateStage =
  | 'draft'
  | 'quote'
  | 'sent'
  | 'approved'
  | 'won'
  | 'lost'
  | 'invoiced';

export type LineItemStatus = 'quote' | 'draft' | 'won' | 'lost';
export type DirectCostType =
  | 'labor'
  | 'sub_contract'
  | 'service'
  | 'product_material'
  | 'asset_equipment'
  | 'other';

// ── line items ─────────────────────────────────────────────────────────────────

export interface EstimateLineItem {
  id: string;
  orgId: string;
  estimateId: string;
  serviceId: string | null;
  serviceName: string;
  status: LineItemStatus;
  calcType: 0 | 1;          // 0 = fixed total, 1 = per-unit (qty × rate × visits)
  qty: number;
  rateCents: number;
  visits: number;
  totalCents: number;
  budgetedHours: number;
  totalBudgetedHours: number;
  costCents: number;
  totalCostCents: number;
  marginBps: number;         // basis points: 10000 = 100%
  markupBps: number;
  adjRateCents: number | null;
  unitType: string | null;               // sqft, lf, cuyd, hr, each, acres
  productionRateSqftPerHr: number | null; // from service record — drives budgetedHours auto-calc
  sortOrder: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── direct costs ───────────────────────────────────────────────────────────────

export interface EstimateDirectCost {
  id: string;
  orgId: string;
  estimateId: string;
  description: string;
  costType: DirectCostType;
  qty: number;
  rateCents: number;
  totalCents: number;
  overheadCents: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ── estimate header ────────────────────────────────────────────────────────────

export interface Estimate {
  id: string;
  orgId: string;
  estimateNumber: number;
  clientId: string;
  description: string;
  salesRepId: string | null;
  source: string | null;
  estDocument: string;
  stage: EstimateStage;
  showDiscounts: boolean;
  estimateDate: string;
  validUntilDate: string | null;
  numInstallments: number;
  poNumber: string | null;
  workOrderNumber: string | null;
  // financials
  subtotalCents: number;
  discountCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  revenueCents: number;
  overheadRateBps: number;
  overheadCostCents: number;
  grossProfitCents: number;
  netProfitCents: number;
  totalBudgetedHours: number;
  probabilityBps: number;  // 0–10000 bps (0–100%)
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  // joined
  clientName?: string;
  clientAddress?: string | null;
  clientCity?: string | null;
  clientState?: string | null;
  clientZip?: string | null;
  clientPhone?: string | null;
  clientSince?: string | null;
  salesRepName?: string;
  lineItems?: EstimateLineItem[];
  directCosts?: EstimateDirectCost[];
}

// ── templates ─────────────────────────────────────────────────────────────────

export interface EstimateTemplate {
  id: string;
  orgId: string;
  name: string;
  estDocument: string;
  showDiscounts: boolean;
  showWhen: 'estimates' | 'jobs' | 'both';
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  items?: EstimateTemplateItem[];
}

export interface EstimateTemplateItem {
  id: string;
  orgId: string;
  templateId: string;
  serviceId: string | null;
  serviceName: string;
  calcType: 0 | 1;
  qty: number;
  rateCents: number;
  visits: number;
  budgetedHours: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ── form values ────────────────────────────────────────────────────────────────

export interface NewEstimateFormValues {
  clientId: string;
  description: string;
  salesRepId: string;
  estimateDate: string;
  validUntilDate: string;
  stage: EstimateStage;
  templateId: string;
}
