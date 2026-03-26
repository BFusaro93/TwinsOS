import { BaseRecord, ApprovalStatus } from "./common";

export interface LineItem {
  id: string;
  productItemId: string;
  productItemName: string;
  partNumber: string;
  quantity: number;
  unitCost: number; // cents
  totalCost: number; // cents
  projectId: string | null;
  notes: string | null;
}

export interface Requisition extends BaseRecord {
  requisitionNumber: string;
  title: string;
  status: ApprovalStatus;
  requestedById: string;
  requestedByName: string;
  vendorId: string | null;
  vendorName: string | null;
  lineItems: LineItem[];
  subtotal: number; // cents
  taxRatePercent: number; // e.g., 7 for 7%
  salesTax: number; // cents
  shippingCost: number; // cents
  grandTotal: number; // cents
  notes: string | null;
  workOrderId: string | null;
  /** Set when this requisition has been converted to a Purchase Order. */
  convertedPoId: string | null;
}
