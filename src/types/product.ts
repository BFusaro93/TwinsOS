import { BaseRecord } from "./common";
import { PartVendor } from "./cmms";
import type { CostLayer } from "@/lib/cost-methods";

export type ProductCategory =
  | "maintenance_part"
  | "stocked_material"
  | "project_material";

export interface ProductItem extends BaseRecord {
  name: string;
  description: string;
  partNumber: string;
  category: ProductCategory;
  unitCost: number; // cents — for WAC: kept in sync; for FIFO/manual: static
  price: number; // cents
  vendorId: string;
  vendorName: string;
  alternateVendors: PartVendor[];
  isInventory: boolean;
  quantityOnHand: number;
  pictureUrl: string | null;
  /** Receipt history used for WAC and FIFO cost calculations. */
  costLayers: CostLayer[];
}
