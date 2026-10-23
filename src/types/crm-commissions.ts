export type CommissionSaleType = "any" | "new" | "renewal";
export type CommissionEarnedOn = "paid" | "invoiced";
export type CommissionStatementStatus = "draft" | "approved" | "paid" | "void";

export interface CommissionRule {
  id: string;
  planId: string;
  /** A specific service wins over a category; neither = all services. */
  serviceId: string | null;
  category: string | null;
  saleType: CommissionSaleType;
  earnedOn: CommissionEarnedOn;
  rateBps: number;
}

export interface CommissionPlan {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  rules: CommissionRule[];
}

export interface CommissionAssignment {
  id: string;
  employeeId: string;
  planId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface CommissionLine {
  evKey: string;
  employeeId: string;
  employeeName: string;
  planId: string;
  planName: string;
  invoiceId: string;
  invoiceNumber: number | null;
  clientId: string;
  clientName: string | null;
  serviceName: string | null;
  category: string | null;
  saleType: "new" | "renewal";
  earnedOn: CommissionEarnedOn;
  eventDate: string;
  basisCents: number;
  rateBps: number;
  commissionCents: number;
  statementId: string | null;
}

export interface CommissionStatement {
  id: string;
  employeeId: string;
  employeeName: string;
  periodStart: string;
  periodEnd: string;
  status: CommissionStatementStatus;
  totalBasisCents: number;
  totalCommissionCents: number;
  approvedAt: string | null;
  paidAt: string | null;
  notes: string | null;
}

export interface CommissionStatementLine {
  id: string;
  invoiceNumber: number | null;
  clientName: string | null;
  planName: string | null;
  serviceName: string | null;
  category: string | null;
  saleType: string | null;
  earnedOn: string | null;
  eventDate: string | null;
  basisCents: number;
  rateBps: number;
  commissionCents: number;
  /** Set on clawback/offset adjustment lines: ev_key of the line being adjusted. */
  sourceEvKey: string | null;
  invoiceId: string | null;
}

/** A clawback (negative) or offset (positive) line the rep's next statement will carry. */
export interface CommissionPendingAdjustment {
  clawEvKey: string;
  sourceEvKey: string;
  employeeId: string;
  invoiceId: string | null;
  invoiceNumber: number | null;
  clientName: string | null;
  planName: string | null;
  serviceName: string | null;
  basisCents: number;
  rateBps: number;
  commissionCents: number;
}
