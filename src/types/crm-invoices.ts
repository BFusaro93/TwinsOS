import type { DiscountType } from "./crm-discounts";

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'void';

export type PaymentMethod =
  | 'ACH/E-Check'
  | 'AR Write-off'
  | 'AutoPay'
  | 'Cash'
  | 'Check'
  | 'Credit Card- AmEx'
  | 'Credit Card- Discover'
  | 'Credit Card- MasterCard'
  | 'Credit Card- Visa'
  | 'Other';

export type ContractStatus =
  | 'draft'
  | 'sent'
  | 'signed'
  | 'active'
  | 'expired'
  | 'cancelled';

export type BillingFrequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'one_time';

export type InvoiceTerms =
  | 'due_on_receipt'
  | 'net_10'
  | 'net_15'
  | 'net_30'
  | 'net_45'
  | 'net_60'
  | 'net_90';

// ── invoice line item ─────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  id: string;
  orgId: string;
  invoiceId: string;
  name: string | null;
  description: string;
  qty: number;
  rateCents: number;
  totalCents: number;
  discountCents: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  appliedDiscountId: string | null;
  isTaxable: boolean;
  sortOrder: number;
  serviceDate: string | null;
  hours: number | null;
  men: number | null;
  visitId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── invoice ───────────────────────────────────────────────────────────────────

export interface CRMInvoice {
  id: string;
  orgId: string;
  invoiceNumber: number;
  clientId: string;
  estimateId: string | null;
  crmJobId: string | null;
  salesRepId: string | null;
  description: string;
  status: InvoiceStatus;
  invoiceDate: string;
  dueDate: string | null;
  poNumber: string | null;
  terms: string | null;
  serviceAddress: string | null;
  subtotalCents: number;
  discountCents: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  appliedDiscountId: string | null;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  balanceCents: number;
  notes: string | null;
  locked: boolean;
  lockedAt: string | null;
  preferredPaymentMethod: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  // joined
  clientName?: string;
  clientAddress?: string | null;
  clientDefaultTaxRateBps?: number;
  clientDefaultTerms?: string;
  clientDefaultPaymentMethod?: string | null;
  salesRepName?: string | null;
  lineItems?: InvoiceLineItem[];
  payments?: CRMPayment[];
}

// ── payment ───────────────────────────────────────────────────────────────────

export interface CRMPayment {
  id: string;
  orgId: string;
  invoiceId: string | null;
  clientId: string;
  amountCents: number;
  unusedAmountCents: number;
  refundedAmountCents: number;
  paymentDate: string;
  method: PaymentMethod;
  reference: string | null;
  memo: string | null;
  notes: string | null;
  isPrepayment: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string | null;
  // joined
  clientName?: string;
  clientAddress?: string;
  invoiceNumber?: number;
}

// ── contract ──────────────────────────────────────────────────────────────────

export interface MonthlyAmounts {
  jan?: number; feb?: number; mar?: number; apr?: number;
  may?: number; jun?: number; jul?: number; aug?: number;
  sep?: number; oct?: number; nov?: number; dec?: number;
}

export interface CRMContract {
  id: string;
  orgId: string;
  clientId: string;
  estimateId: string | null;
  title: string;
  status: ContractStatus;
  startDate: string | null;
  endDate: string | null;
  monthlyAmountCents: number;
  billingFrequency: BillingFrequency;
  autoRenew: boolean;
  notes: string | null;
  signedAt: string | null;
  signedBy: string | null;
  billingDayOfMonth: number;
  billMonthInAdvance: boolean;
  paymentType: string | null;
  poNumber: string | null;
  autoGenerate: boolean;
  isActive: boolean;
  includeSubProperties: boolean;
  source: string | null;
  salesRepId: string | null;
  lastBilledDate: string | null;
  monthlyAmounts: MonthlyAmounts;
  invoiceLineItems: string[];
  defaultService: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  // joined
  clientName?: string;
  salesRepName?: string | null;
}

export interface CRMContractNote {
  id: string;
  orgId: string;
  contractId: string;
  body: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
