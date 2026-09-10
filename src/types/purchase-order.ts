import { BaseRecord } from "./common";
import { LineItem } from "./requisition";

export type POStatus =
  | "requested"
  | "pending"
  | "approved"
  | "ordered"
  | "canceled"
  | "completed"
  | "rejected"
  | "partially_fulfilled";

export type PaymentType = "check" | "ach" | "credit_card";

export interface PurchaseOrder extends BaseRecord {
  poNumber: string;
  poDate: string | null;
  invoiceNumber: string | null;
  status: POStatus;
  vendorId: string;
  vendorName: string;
  lineItems: LineItem[];
  subtotal: number; // cents
  taxRatePercent: number; // e.g., 7 for 7%
  salesTax: number; // cents
  shippingCost: number; // cents
  discountCost: number; // cents — positive magnitude, subtracted from grandTotal
  /** True when the discount comes off the taxable base before sales tax is
   *  computed; false (the default) taxes the full amount and credits the
   *  discount after. Vendors differ — RockAuto discounts pre-tax, Powell
   *  Stone & Gravel post-tax. */
  discountReducesTax: boolean;
  grandTotal: number; // cents
  requisitionId: string | null;
  paymentSubmittedToAP: boolean;
  paymentRemitted: boolean;
  paymentType: PaymentType | null;
  checkNumber: string | null;
  paymentBookedInQB: boolean;
  notes: string | null;
}
