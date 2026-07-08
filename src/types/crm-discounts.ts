export type DiscountType = "percent" | "flat";

export interface CRMDiscount {
  id: string;
  name: string;
  discountType: DiscountType;
  percentBps: number | null;
  flatCents: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}
