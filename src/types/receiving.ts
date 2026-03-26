import { BaseRecord } from "./common";

export interface GoodsReceiptLine {
  id: string;
  lineItemId: string;
  productItemName: string;
  partNumber: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: number; // cents
  isMaintPart: boolean; // true = triggers parts inventory update
}

export interface GoodsReceipt extends BaseRecord {
  receiptNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  vendorName: string;
  receivedById: string;
  receivedByName: string;
  receivedAt: string;
  lines: GoodsReceiptLine[];
  subtotal: number; // cents — sum of (unitCost × quantityReceived)
  taxRatePercent: number; // e.g., 7 for 7%
  salesTax: number; // cents
  shippingCost: number; // cents
  grandTotal: number; // cents
  notes: string | null;
}
