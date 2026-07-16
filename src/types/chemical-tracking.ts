export type ChemicalLookupType =
  | "application_method"
  | "target"
  | "volume_unit"
  | "area_unit"
  | "areas_treated";

export interface ChemicalLookupItem {
  id: string;
  orgId: string;
  listType: ChemicalLookupType;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ChemicalApplicationRate {
  id: string;
  orgId: string;
  productId: string;
  applicationMethodId: string | null;
  rateQty: number | null;
  unitOfMeasureId: string | null;
  areaQty: number | null;
  areaUnitId: string | null;
  productCostCents: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  // joined display fields
  applicationMethodName?: string | null;
  unitOfMeasureName?: string | null;
  areaUnitName?: string | null;
}

export interface ServiceChemical {
  id: string;
  orgId: string;
  serviceId: string;
  productId: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  // joined display fields
  productName?: string;
}

export interface ChemicalApplication {
  id: string;
  orgId: string;
  jobId: string;
  visitId: string | null;
  productId: string | null;
  chemicalAmount: number | null;
  solutionAmount: number | null;
  unitOfMeasureId: string | null;
  targetIds: string[];
  areasTreatedIds: string[];
  applicationMethodId: string | null;
  applicationRateLabel: string | null;
  used: boolean;
  applicatorEmployeeId: string | null;
  applicatorLicenseNumber: string | null;
  epaNumberSnapshot: string | null;
  applicationStartTime: string | null;
  applicationEndTime: string | null;
  temperature: number | null;
  windSpeed: number | null;
  windDirection: string | null;
  phLevel: number | null;
  budgetedConcentrateAmount: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  deletedAt: string | null;
  // joined display fields
  productName?: string | null;
}

export type ChemicalConditionsDisplay = "weather" | "ph" | "both" | "neither";

export interface ChemicalSettings {
  id: string;
  orgId: string;
  defaultUnitOfMeasureId: string | null;
  conditionsDisplay: ChemicalConditionsDisplay;
  autoCalcQuantity: boolean;
  /** Property custom field (crm_rate_matrix_field_defs) that represents treatable area, e.g. "Turf Sq Ft". */
  areaCustomFieldId: string | null;
  updatedAt: string;
}
