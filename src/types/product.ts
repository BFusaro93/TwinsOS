import { BaseRecord } from "./common";
import { PartVendor } from "./cmms";
import type { CostLayer } from "@/lib/cost-methods";

export type ProductCategory =
  | "maintenance_part"
  | "stocked_material"
  | "project_material";

export interface ActiveIngredient {
  name: string;
  percentage: number;
}

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
  /** Minimum stock level before reorder — populated for maintenance_part items. */
  minimumStock: number;
  /** CMMS part category (e.g. "Electrical", "Hydraulic") — maintenance_part only. */
  partCategory: string | null;
  /** Chemical Tracking (CRM) — track_chemicals unlocks the fields below. */
  trackChemicals: boolean;
  scientificName: string | null;
  epaRegistrationNumber: string | null;
  epaUrl: string | null;
  labelInstructions: string | null;
  routeSheetInstructions: string | null;
  activeIngredients: ActiveIngredient[];
  reEntryInterval: string | null;
  restrictedProduct: boolean;
}
