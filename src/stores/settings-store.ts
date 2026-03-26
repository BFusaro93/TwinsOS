import { create } from "zustand";
import type { CostMethod } from "@/lib/cost-methods";

// ── Work Order Categories ─────────────────────────────────────────────────────

export interface WOCategoryConfig {
  id: string;
  label: string;
  enabled: boolean;
  isBuiltIn: boolean;
}

const DEFAULT_WO_CATEGORIES: WOCategoryConfig[] = [
  { id: "brakes",                   label: "Brakes",                   enabled: true, isBuiltIn: true },
  { id: "electrical",               label: "Electrical",               enabled: true, isBuiltIn: true },
  { id: "inspection",               label: "Inspection",               enabled: true, isBuiltIn: true },
  { id: "oil_change",               label: "Oil Change",               enabled: true, isBuiltIn: true },
  { id: "preventative_maintenance", label: "Preventative Maintenance", enabled: true, isBuiltIn: true },
  { id: "repair_broken",            label: "Repair/Broken",            enabled: true, isBuiltIn: true },
  { id: "safety",                   label: "Safety",                   enabled: true, isBuiltIn: true },
  { id: "tires",                    label: "Tires",                    enabled: true, isBuiltIn: true },
];

// ── Part Categories ───────────────────────────────────────────────────────────

export interface PartCategoryConfig {
  id: string;
  label: string;
  enabled: boolean;
  isBuiltIn: boolean;
}

const DEFAULT_PART_CATEGORIES: PartCategoryConfig[] = [
  { id: "filters",          label: "Filters",          enabled: true, isBuiltIn: true },
  { id: "belts",            label: "Belts",            enabled: true, isBuiltIn: true },
  { id: "blades",           label: "Blades",           enabled: true, isBuiltIn: true },
  { id: "electrical",       label: "Electrical",       enabled: true, isBuiltIn: true },
  { id: "hardware",         label: "Hardware",         enabled: true, isBuiltIn: true },
  { id: "lubricants",       label: "Lubricants",       enabled: true, isBuiltIn: true },
  { id: "tires",            label: "Tires",            enabled: true, isBuiltIn: true },
  { id: "brake_components", label: "Brake Components", enabled: true, isBuiltIn: true },
  { id: "hydraulics",       label: "Hydraulics",       enabled: true, isBuiltIn: true },
  { id: "other",            label: "Other",            enabled: true, isBuiltIn: true },
];

// ── Asset Types ───────────────────────────────────────────────────────────────

export interface AssetTypeConfig {
  id: string;
  label: string;
  enabled: boolean;
  isBuiltIn: boolean;
}

const DEFAULT_ASSET_TYPES: AssetTypeConfig[] = [
  { id: "skid_steer",      label: "Skid Steer",        enabled: true, isBuiltIn: true },
  { id: "zero_turn_mower", label: "Zero Turn Mower",   enabled: true, isBuiltIn: true },
  { id: "walk_behind",     label: "Walk Behind Mower", enabled: true, isBuiltIn: true },
  { id: "trimmer",         label: "Trimmer",           enabled: true, isBuiltIn: true },
  { id: "blower",          label: "Blower",            enabled: true, isBuiltIn: true },
  { id: "attachment",      label: "Attachment",        enabled: true, isBuiltIn: true },
  { id: "vehicle",         label: "Vehicle",           enabled: true, isBuiltIn: true },
  { id: "trailer",         label: "Trailer",           enabled: true, isBuiltIn: true },
  { id: "other",           label: "Other",             enabled: true, isBuiltIn: true },
];

// ── Fuel Types ────────────────────────────────────────────────────────────────

export interface FuelTypeConfig {
  id: string;
  label: string;
  enabled: boolean;
  isBuiltIn: boolean;
}

const DEFAULT_FUEL_TYPES: FuelTypeConfig[] = [
  { id: "gasoline", label: "Gasoline", enabled: true, isBuiltIn: true },
  { id: "diesel",   label: "Diesel",   enabled: true, isBuiltIn: true },
  { id: "electric", label: "Electric", enabled: true, isBuiltIn: true },
  { id: "hybrid",   label: "Hybrid",   enabled: true, isBuiltIn: true },
];

// ── Locations ─────────────────────────────────────────────────────────────────

export interface LocationConfig {
  id: string;
  label: string;
  enabled: boolean;
  isBuiltIn: boolean;
}

const DEFAULT_LOCATIONS: LocationConfig[] = [
  { id: "main_yard",     label: "Main Yard",      enabled: true, isBuiltIn: true },
  { id: "shop",          label: "Shop",           enabled: true, isBuiltIn: true },
  { id: "warehouse",     label: "Warehouse",      enabled: true, isBuiltIn: true },
  { id: "crew1_trailer", label: "Crew 1 Trailer", enabled: true, isBuiltIn: true },
  { id: "crew2_trailer", label: "Crew 2 Trailer", enabled: true, isBuiltIn: true },
  { id: "crew3_trailer", label: "Crew 3 Trailer", enabled: true, isBuiltIn: true },
  { id: "offsite",       label: "Offsite",        enabled: true, isBuiltIn: true },
];

// ── Vendor Types ──────────────────────────────────────────────────────────────

export interface VendorTypeConfig {
  id: string;
  label: string;
  enabled: boolean;
  isBuiltIn: boolean;
}

const DEFAULT_VENDOR_TYPES: VendorTypeConfig[] = [
  { id: "repair_shop",   label: "Repair Shop",  enabled: true, isBuiltIn: true },
  { id: "manufacturer", label: "Manufacturer", enabled: true, isBuiltIn: true },
  { id: "distributor",  label: "Distributor",  enabled: true, isBuiltIn: true },
  { id: "supplier",     label: "Supplier",     enabled: true, isBuiltIn: true },
  { id: "contractor",   label: "Contractor",   enabled: true, isBuiltIn: true },
];

// ── Required Fields ───────────────────────────────────────────────────────────

export type FieldRequirement = "required" | "optional" | "hidden";

export interface EntityFieldConfig {
  field: string;
  label: string;
  requirement: FieldRequirement;
  /** Built-in fields cannot be deleted */
  isBuiltIn: boolean;
}

export type RequiredFieldsConfig = Record<string, EntityFieldConfig[]>;

const DEFAULT_REQUIRED_FIELDS: RequiredFieldsConfig = {
  purchase_order: [
    { field: "vendor",        label: "Vendor",        requirement: "required", isBuiltIn: true },
    { field: "project",       label: "Project",       requirement: "optional", isBuiltIn: true },
    { field: "notes",         label: "Notes",         requirement: "optional", isBuiltIn: true },
    { field: "shipping_cost", label: "Shipping Cost", requirement: "optional", isBuiltIn: true },
  ],
  requisition: [
    { field: "vendor", label: "Vendor", requirement: "optional", isBuiltIn: true },
    { field: "title",  label: "Title",  requirement: "required", isBuiltIn: true },
    { field: "notes",  label: "Notes",  requirement: "optional", isBuiltIn: true },
  ],
  work_order: [
    { field: "priority",        label: "Priority",        requirement: "required", isBuiltIn: true },
    { field: "category",        label: "Category",        requirement: "optional", isBuiltIn: true },
    { field: "assigned_to",     label: "Assigned To",     requirement: "optional", isBuiltIn: true },
    { field: "estimated_hours", label: "Estimated Hours", requirement: "optional", isBuiltIn: true },
    { field: "due_date",        label: "Due Date",        requirement: "optional", isBuiltIn: true },
  ],
  asset: [
    { field: "location",      label: "Location",      requirement: "optional", isBuiltIn: true },
    { field: "serial_number", label: "Serial Number", requirement: "optional", isBuiltIn: true },
    { field: "year",          label: "Year",          requirement: "optional", isBuiltIn: true },
    { field: "make_model",    label: "Make / Model",  requirement: "optional", isBuiltIn: true },
  ],
  vehicle: [
    { field: "license_plate", label: "License Plate", requirement: "optional", isBuiltIn: true },
    { field: "year",          label: "Year",          requirement: "required", isBuiltIn: true },
    { field: "make",          label: "Make",          requirement: "required", isBuiltIn: true },
    { field: "model",         label: "Model",         requirement: "optional", isBuiltIn: true },
    { field: "mileage",       label: "Mileage",       requirement: "optional", isBuiltIn: true },
  ],
};

// ── Quick Reference Part # Fields ────────────────────────────────────────────

/**
 * Built-in fields map directly to typed fields on Asset/Vehicle.
 * Custom fields (fieldKey: null) are label-only — per-asset values
 * will be stored once backend custom-field support is added.
 */
export type FilterFieldKey =
  | "airFilterPartNumber"
  | "oilFilterPartNumber"
  | "sparkPlugPartNumber";

export interface FilterFieldConfig {
  id: string;
  label: string;
  /** null = user-defined custom field with no typed DB column yet */
  fieldKey: FilterFieldKey | null;
  enabled: boolean;
  /** Built-in fields can be toggled/renamed but not deleted */
  isBuiltIn: boolean;
}

const DEFAULT_FILTER_FIELDS: FilterFieldConfig[] = [
  { id: "air_filter", label: "Air Filter",  fieldKey: "airFilterPartNumber", enabled: true, isBuiltIn: true },
  { id: "oil_filter", label: "Oil Filter",  fieldKey: "oilFilterPartNumber", enabled: true, isBuiltIn: true },
  { id: "spark_plug", label: "Spark Plug",  fieldKey: "sparkPlugPartNumber", enabled: true, isBuiltIn: true },
];

// ── Branding ──────────────────────────────────────────────────────────────────

export interface CompanyAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
}

// ── Store ────────────────────────────────────────────────────────────────────

interface SettingsState {
  orgName: string;
  setOrgName: (name: string) => void;

  /** Base-64 data URL of the uploaded company logo, or null if none set */
  logoDataUrl: string | null;
  setLogoDataUrl: (url: string | null) => void;

  companyAddress: CompanyAddress;
  setCompanyAddress: (partial: Partial<CompanyAddress>) => void;

  taxRatePercent: number;
  setTaxRatePercent: (rate: number) => void;

  /** Inventory costing method for pre-filling unit costs on new line items. */
  costMethod: CostMethod;
  setCostMethod: (method: CostMethod) => void;

  filterFields: FilterFieldConfig[];
  setFilterFieldEnabled: (id: string, enabled: boolean) => void;
  setFilterFieldLabel: (id: string, label: string) => void;
  addFilterField: (label: string) => void;
  removeFilterField: (id: string) => void;

  woCategories: WOCategoryConfig[];
  setWOCategoryEnabled: (id: string, enabled: boolean) => void;
  setWOCategoryLabel: (id: string, label: string) => void;
  addWOCategory: (label: string) => void;
  removeWOCategory: (id: string) => void;

  assetTypes: AssetTypeConfig[];
  setAssetTypeEnabled: (id: string, enabled: boolean) => void;
  setAssetTypeLabel: (id: string, label: string) => void;
  addAssetType: (label: string) => void;
  removeAssetType: (id: string) => void;

  fuelTypes: FuelTypeConfig[];
  setFuelTypeEnabled: (id: string, enabled: boolean) => void;
  setFuelTypeLabel: (id: string, label: string) => void;
  addFuelType: (label: string) => void;
  removeFuelType: (id: string) => void;

  locations: LocationConfig[];
  setLocationEnabled: (id: string, enabled: boolean) => void;
  setLocationLabel: (id: string, label: string) => void;
  addLocation: (label: string) => void;
  removeLocation: (id: string) => void;

  partCategories: PartCategoryConfig[];
  setPartCategoryEnabled: (id: string, enabled: boolean) => void;
  setPartCategoryLabel: (id: string, label: string) => void;
  addPartCategory: (label: string) => void;
  removePartCategory: (id: string) => void;

  /** Brand accent color used on printed PO/WO PDFs */
  brandColor: string;
  setBrandColor: (color: string) => void;

  vendorTypes: VendorTypeConfig[];
  setVendorTypeEnabled: (id: string, enabled: boolean) => void;
  setVendorTypeLabel: (id: string, label: string) => void;
  addVendorType: (label: string) => void;
  removeVendorType: (id: string) => void;

  requiredFields: RequiredFieldsConfig;
  setFieldRequirement: (entity: string, field: string, requirement: FieldRequirement) => void;

  /** Whether the public maintenance-request portal is accepting submissions */
  portalEnabled: boolean;
  setPortalEnabled: (enabled: boolean) => void;

  /** Bulk-load all settings from the remote org row on first mount. */
  loadFromRemote: (data: {
    orgName?: string;
    brandColor?: string;
    address?: Partial<CompanyAddress>;
    taxRatePercent?: number;
    costMethod?: CostMethod;
    portalEnabled?: boolean;
    woCategories?: WOCategoryConfig[];
    partCategories?: PartCategoryConfig[];
    assetTypes?: AssetTypeConfig[];
    fuelTypes?: FuelTypeConfig[];
    locations?: LocationConfig[];
    vendorTypes?: VendorTypeConfig[];
    filterFields?: FilterFieldConfig[];
    requiredFields?: RequiredFieldsConfig;
  }) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  orgName: "Twins Lawn Service",
  setOrgName: (name) => set({ orgName: name }),

  logoDataUrl: null,
  setLogoDataUrl: (url) => set({ logoDataUrl: url }),

  companyAddress: { street: "", city: "", state: "", zip: "", phone: "" },
  setCompanyAddress: (partial) =>
    set((s) => ({ companyAddress: { ...s.companyAddress, ...partial } })),

  taxRatePercent: 7,
  setTaxRatePercent: (rate) => set({ taxRatePercent: rate }),

  costMethod: "manual",
  setCostMethod: (method) => set({ costMethod: method }),

  filterFields: DEFAULT_FILTER_FIELDS,

  setFilterFieldEnabled: (id, enabled) =>
    set((s) => ({
      filterFields: s.filterFields.map((f) => (f.id === id ? { ...f, enabled } : f)),
    })),

  setFilterFieldLabel: (id, label) =>
    set((s) => ({
      filterFields: s.filterFields.map((f) => (f.id === id ? { ...f, label } : f)),
    })),

  addFilterField: (label) =>
    set((s) => ({
      filterFields: [
        ...s.filterFields,
        {
          id: `custom_${Date.now()}`,
          label,
          fieldKey: null,
          enabled: true,
          isBuiltIn: false,
        },
      ],
    })),

  removeFilterField: (id) =>
    set((s) => ({
      filterFields: s.filterFields.filter((f) => f.id !== id || f.isBuiltIn),
    })),

  woCategories: DEFAULT_WO_CATEGORIES,

  setWOCategoryEnabled: (id, enabled) =>
    set((s) => ({
      woCategories: s.woCategories.map((c) => (c.id === id ? { ...c, enabled } : c)),
    })),

  setWOCategoryLabel: (id, label) =>
    set((s) => ({
      woCategories: s.woCategories.map((c) => (c.id === id ? { ...c, label } : c)),
    })),

  addWOCategory: (label) =>
    set((s) => ({
      woCategories: [
        ...s.woCategories,
        {
          id: `custom_wo_${Date.now()}`,
          label,
          enabled: true,
          isBuiltIn: false,
        },
      ],
    })),

  removeWOCategory: (id) =>
    set((s) => ({
      woCategories: s.woCategories.filter((c) => c.id !== id || c.isBuiltIn),
    })),

  assetTypes: DEFAULT_ASSET_TYPES,

  setAssetTypeEnabled: (id, enabled) =>
    set((s) => ({
      assetTypes: s.assetTypes.map((t) => (t.id === id ? { ...t, enabled } : t)),
    })),

  setAssetTypeLabel: (id, label) =>
    set((s) => ({
      assetTypes: s.assetTypes.map((t) => (t.id === id ? { ...t, label } : t)),
    })),

  addAssetType: (label) =>
    set((s) => ({
      assetTypes: [
        ...s.assetTypes,
        {
          id: `custom_assettype_${Date.now()}`,
          label,
          enabled: true,
          isBuiltIn: false,
        },
      ],
    })),

  removeAssetType: (id) =>
    set((s) => ({
      assetTypes: s.assetTypes.filter((t) => t.id !== id || t.isBuiltIn),
    })),

  fuelTypes: DEFAULT_FUEL_TYPES,

  setFuelTypeEnabled: (id, enabled) =>
    set((s) => ({
      fuelTypes: s.fuelTypes.map((f) => (f.id === id ? { ...f, enabled } : f)),
    })),

  setFuelTypeLabel: (id, label) =>
    set((s) => ({
      fuelTypes: s.fuelTypes.map((f) => (f.id === id ? { ...f, label } : f)),
    })),

  addFuelType: (label) =>
    set((s) => ({
      fuelTypes: [
        ...s.fuelTypes,
        {
          id: `custom_fuel_${Date.now()}`,
          label,
          enabled: true,
          isBuiltIn: false,
        },
      ],
    })),

  removeFuelType: (id) =>
    set((s) => ({
      fuelTypes: s.fuelTypes.filter((f) => f.id !== id || f.isBuiltIn),
    })),

  locations: DEFAULT_LOCATIONS,

  setLocationEnabled: (id, enabled) =>
    set((s) => ({
      locations: s.locations.map((l) => (l.id === id ? { ...l, enabled } : l)),
    })),

  setLocationLabel: (id, label) =>
    set((s) => ({
      locations: s.locations.map((l) => (l.id === id ? { ...l, label } : l)),
    })),

  addLocation: (label) =>
    set((s) => ({
      locations: [
        ...s.locations,
        {
          id: `custom_loc_${Date.now()}`,
          label,
          enabled: true,
          isBuiltIn: false,
        },
      ],
    })),

  removeLocation: (id) =>
    set((s) => ({
      locations: s.locations.filter((l) => l.id !== id || l.isBuiltIn),
    })),

  partCategories: DEFAULT_PART_CATEGORIES,

  setPartCategoryEnabled: (id, enabled) =>
    set((s) => ({
      partCategories: s.partCategories.map((c) => (c.id === id ? { ...c, enabled } : c)),
    })),

  setPartCategoryLabel: (id, label) =>
    set((s) => ({
      partCategories: s.partCategories.map((c) => (c.id === id ? { ...c, label } : c)),
    })),

  addPartCategory: (label) =>
    set((s) => ({
      partCategories: [
        ...s.partCategories,
        {
          id: `custom_partcat_${Date.now()}`,
          label,
          enabled: true,
          isBuiltIn: false,
        },
      ],
    })),

  removePartCategory: (id) =>
    set((s) => ({
      partCategories: s.partCategories.filter((c) => c.id !== id || c.isBuiltIn),
    })),

  brandColor: "#60ab45",
  setBrandColor: (color) => set({ brandColor: color }),

  vendorTypes: DEFAULT_VENDOR_TYPES,

  setVendorTypeEnabled: (id, enabled) =>
    set((s) => ({
      vendorTypes: s.vendorTypes.map((v) => (v.id === id ? { ...v, enabled } : v)),
    })),

  setVendorTypeLabel: (id, label) =>
    set((s) => ({
      vendorTypes: s.vendorTypes.map((v) => (v.id === id ? { ...v, label } : v)),
    })),

  addVendorType: (label) =>
    set((s) => ({
      vendorTypes: [
        ...s.vendorTypes,
        {
          id: `custom_vendortype_${Date.now()}`,
          label,
          enabled: true,
          isBuiltIn: false,
        },
      ],
    })),

  removeVendorType: (id) =>
    set((s) => ({
      vendorTypes: s.vendorTypes.filter((v) => v.id !== id || v.isBuiltIn),
    })),

  requiredFields: DEFAULT_REQUIRED_FIELDS,

  setFieldRequirement: (entity, field, requirement) =>
    set((s) => ({
      requiredFields: {
        ...s.requiredFields,
        [entity]: (s.requiredFields[entity] ?? []).map((f) =>
          f.field === field ? { ...f, requirement } : f
        ),
      },
    })),

  portalEnabled: true,
  setPortalEnabled: (enabled) => set({ portalEnabled: enabled }),

  loadFromRemote: (data) =>
    set((s) => ({
      ...(data.orgName !== undefined      && { orgName: data.orgName }),
      ...(data.brandColor !== undefined   && { brandColor: data.brandColor }),
      ...(data.address !== undefined      && { companyAddress: { ...s.companyAddress, ...data.address } }),
      ...(data.taxRatePercent !== undefined && { taxRatePercent: data.taxRatePercent }),
      ...(data.costMethod !== undefined   && { costMethod: data.costMethod }),
      ...(data.portalEnabled !== undefined && { portalEnabled: data.portalEnabled }),
      ...(data.woCategories !== undefined && { woCategories: data.woCategories }),
      ...(data.partCategories !== undefined && { partCategories: data.partCategories }),
      ...(data.assetTypes !== undefined   && { assetTypes: data.assetTypes }),
      ...(data.fuelTypes !== undefined    && { fuelTypes: data.fuelTypes }),
      ...(data.locations !== undefined    && { locations: data.locations }),
      ...(data.vendorTypes !== undefined  && { vendorTypes: data.vendorTypes }),
      ...(data.filterFields !== undefined && { filterFields: data.filterFields }),
      ...(data.requiredFields !== undefined && { requiredFields: data.requiredFields }),
    })),
}));
