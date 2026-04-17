/**
 * Maps Supabase DB rows (snake_case) to application TypeScript types (camelCase).
 * All monetary values are stored as integer cents in the DB — no conversion needed.
 * JSONB columns (cost_layers, alternate_vendors) are cast from Json to their typed equivalents.
 */
import type { Database } from "@/types/supabase";
import type {
  Vendor,
  W9Status,
  ProductItem,
  ProductCategory,
  Project,
  ProjectStatus,
  LineItem,
  Requisition,
  ApprovalStatus,
  PurchaseOrder,
  POStatus,
  PaymentType,
  ApprovalFlow,
  ApprovalFlowStep,
  ApprovalRequest,
  ApprovalRequestStatus,
  Comment,
  CommentRecordType,
  Role,
} from "@/types";
import type {
  Part,
  PartVendor,
  Asset,
  Vehicle,
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  PMSchedule,
  Meter,
  MeterReading,
  AssetPart,
  MaintenanceRequest,
  MaintenanceRequestStatus,
  PaymentMethod,
  AssetStatus,
  WOPart,
  WOLaborEntry,
  WOVendorCharge,
  PMPart,
} from "@/types/cmms";
import type { GoodsReceipt, GoodsReceiptLine } from "@/types/receiving";
import type { Attachment, AttachmentRecordType } from "@/types/attachment";
import type { AuditEntry, AuditAction, AuditRecordType } from "@/types/audit";
import type { OrgUser } from "@/types/common";
import type { CostLayer } from "@/lib/cost-methods";

// ── Row type aliases ──────────────────────────────────────────────────────────

type VendorRow = Database["public"]["Tables"]["vendors"]["Row"];
type ProductItemRow = Database["public"]["Tables"]["product_items"]["Row"];
type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type RequisitionRow = Database["public"]["Tables"]["requisitions"]["Row"];
type ReqLineItemRow =
  Database["public"]["Tables"]["requisition_line_items"]["Row"];
type PORow = Database["public"]["Tables"]["purchase_orders"]["Row"];
type POLineItemRow = Database["public"]["Tables"]["po_line_items"]["Row"];
type ApprovalFlowRow = Database["public"]["Tables"]["approval_flows"]["Row"];
type ApprovalFlowStepRow =
  Database["public"]["Tables"]["approval_flow_steps"]["Row"];
type ApprovalRequestRow =
  Database["public"]["Tables"]["approval_requests"]["Row"];
type CommentRow = Database["public"]["Tables"]["comments"]["Row"];

// ── Mappers ───────────────────────────────────────────────────────────────────

export function mapVendor(row: VendorRow): Vendor {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    name: row.name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    website: row.website,
    notes: row.notes,
    vendorType: row.vendor_type,
    isActive: row.is_active,
    w9Status: row.w9_status as W9Status,
    w9ReceivedDate: row.w9_received_date,
    w9ExpirationDate: row.w9_expiration_date,
  };
}

export function mapProductItem(row: ProductItemRow): ProductItem {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    name: row.name,
    description: row.description,
    partNumber: row.part_number,
    category: row.category as ProductCategory,
    unitCost: row.unit_cost,
    price: row.price,
    vendorId: row.vendor_id ?? "",
    vendorName: row.vendor_name,
    alternateVendors: (row.alternate_vendors as unknown as PartVendor[]) ?? [],
    isInventory: row.is_inventory,
    quantityOnHand: row.quantity_on_hand,
    pictureUrl: row.picture_url,
    costLayers: (row.cost_layers as unknown as CostLayer[]) ?? [],
    minimumStock: (row as unknown as { minimum_stock?: number }).minimum_stock ?? 0,
    partCategory: (row as unknown as { part_category?: string | null }).part_category ?? null,
  };
}

export function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    name: row.name,
    customerName: row.customer_name,
    address: row.address,
    status: row.status as ProjectStatus,
    startDate: row.start_date ?? "",
    endDate: row.end_date,
    totalCost: row.total_cost,
    notes: row.notes,
  };
}

export function mapLineItem(row: ReqLineItemRow | POLineItemRow): LineItem {
  return {
    id: row.id,
    productItemId: row.product_item_id ?? "",
    partId: row.part_id ?? null,
    productItemName: row.product_item_name,
    partNumber: row.part_number,
    quantity: row.quantity,
    unitCost: row.unit_cost,
    totalCost: row.total_cost,
    projectId: row.project_id,
    notes: row.notes,
  };
}

export function mapRequisition(
  row: RequisitionRow & { requisition_line_items?: ReqLineItemRow[] }
): Requisition {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    requisitionNumber: row.requisition_number,
    title: row.title,
    status: row.status as ApprovalStatus,
    requestedById: row.requested_by_id ?? "",
    requestedByName: row.requested_by_name,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    lineItems: (row.requisition_line_items ?? []).map(mapLineItem),
    subtotal: row.subtotal,
    taxRatePercent: Number(row.tax_rate_percent),
    salesTax: row.sales_tax,
    shippingCost: row.shipping_cost,
    grandTotal: row.grand_total,
    notes: row.notes,
    workOrderId: row.work_order_id,
    convertedPoId: row.converted_po_id,
  };
}

export function mapPurchaseOrder(
  row: PORow & { po_line_items?: POLineItemRow[] }
): PurchaseOrder {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    poNumber: row.po_number,
    poDate: row.po_date,
    invoiceNumber: row.invoice_number,
    status: row.status as POStatus,
    vendorId: row.vendor_id ?? "",
    vendorName: row.vendor_name,
    lineItems: (row.po_line_items ?? []).map(mapLineItem),
    subtotal: row.subtotal,
    taxRatePercent: Number(row.tax_rate_percent),
    salesTax: row.sales_tax,
    shippingCost: row.shipping_cost,
    grandTotal: row.grand_total,
    requisitionId: row.requisition_id,
    paymentSubmittedToAP: row.payment_submitted_to_ap,
    paymentRemitted: row.payment_remitted,
    paymentType: row.payment_type as PaymentType | null,
    paymentBookedInQB: row.payment_booked_in_qb,
    notes: row.notes,
  };
}

export function mapApprovalFlowStep(row: ApprovalFlowStepRow): ApprovalFlowStep {
  return {
    id: row.id,
    order: row.order,
    requiredRole: row.required_role as Role,
    label: row.label,
    thresholdCents: row.threshold_cents,
    assignedUserId: row.assigned_user_id,
  };
}

export function mapApprovalFlow(
  row: ApprovalFlowRow & { approval_flow_steps?: ApprovalFlowStepRow[] }
): ApprovalFlow {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    entityType: row.entity_type as ApprovalFlow["entityType"],
    steps: (row.approval_flow_steps ?? [])
      .sort((a, b) => a.order - b.order)
      .map(mapApprovalFlowStep),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapApprovalRequest(row: ApprovalRequestRow): ApprovalRequest {
  return {
    id: row.id,
    orgId: row.org_id,
    entityType: row.entity_type as ApprovalFlow["entityType"],
    entityId: row.entity_id,
    flowStepId: row.flow_step_id ?? "",
    order: row.order,
    approverId: row.approver_id ?? "",
    approverName: row.approver_name,
    approverRole: row.approver_role as Role,
    status: row.status as ApprovalRequestStatus,
    decidedAt: row.decided_at,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapComment(row: CommentRow): Comment {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    recordType: row.record_type as CommentRecordType,
    recordId: row.record_id,
    authorId: row.author_id ?? "",
    authorName: row.author_name,
    body: row.body,
  };
}

type PartRow = Database["public"]["Tables"]["parts"]["Row"];

export function mapPart(row: PartRow): Part {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    name: row.name,
    partNumber: row.part_number,
    description: row.description,
    category: row.category,
    quantityOnHand: row.quantity_on_hand,
    minimumStock: row.minimum_stock,
    unitCost: row.unit_cost,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    alternateVendors: (row.alternate_vendors as unknown as PartVendor[]) ?? [],
    parentPartId: row.parent_part_id,
    isInventory: row.is_inventory,
    pictureUrl: row.picture_url,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    location: (row as any).location ?? null,
    productItemId: row.product_item_id,
    costLayers: (row.cost_layers as unknown as CostLayer[]) ?? [],
  };
}

type AssetRow = Database["public"]["Tables"]["assets"]["Row"];

export function mapAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    name: row.name,
    assetTag: row.asset_tag,
    equipmentNumber: row.equipment_number,
    assetType: row.asset_type,
    status: row.status as AssetStatus,
    make: row.make,
    model: row.model,
    year: row.year,
    serialNumber: row.serial_number,
    engineSerialNumber: row.engine_serial_number,
    airFilterPartNumber: row.air_filter_part_number,
    oilFilterPartNumber: row.oil_filter_part_number,
    sparkPlugPartNumber: row.spark_plug_part_number,
    division: row.division,
    engineModel: row.engine_model,
    manufacturer: row.manufacturer,
    assignedCrew: row.assigned_crew,
    barcode: row.barcode,
    parentAssetId: row.parent_asset_id,
    purchaseVendorId: row.purchase_vendor_id,
    purchaseVendorName: row.purchase_vendor_name,
    purchaseDate: row.purchase_date,
    purchasePrice: row.purchase_price,
    paymentMethod: row.payment_method as PaymentMethod | null,
    financeInstitution: row.finance_institution,
    location: row.location,
    photoUrl: row.photo_url,
    notes: row.notes,
  };
}

type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];

export function mapVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    name: row.name,
    assetTag: row.asset_tag,
    equipmentNumber: row.equipment_number,
    assetType: row.asset_type,
    status: row.status as AssetStatus,
    make: row.make,
    model: row.model,
    year: row.year,
    serialNumber: row.serial_number,
    engineSerialNumber: row.engine_serial_number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    airFilterPartNumber: (row as any).air_filter_part_number ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    oilFilterPartNumber: (row as any).oil_filter_part_number ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sparkPlugPartNumber: (row as any).spark_plug_part_number ?? null,
    division: row.division,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    engineModel: (row as any).engine_model ?? null,
    manufacturer: null,
    assignedCrew: row.assigned_crew,
    barcode: row.barcode,
    parentAssetId: null,
    purchaseVendorId: row.purchase_vendor_id,
    purchaseVendorName: row.purchase_vendor_name,
    purchaseDate: row.purchase_date,
    purchasePrice: row.purchase_price,
    paymentMethod: row.payment_method as PaymentMethod | null,
    financeInstitution: row.finance_institution,
    location: row.location,
    photoUrl: row.photo_url,
    notes: row.notes,
    licensePlate: row.license_plate,
    vin: row.vin,
    samsaraVehicleId: row.samsara_vehicle_id,
    fuelType: row.fuel_type,
    nextOilChangeDue: row.next_oil_change_due,
    nextOilChangeMileage: row.next_oil_change_mileage,
    nextInspectionStickerDue: row.next_inspection_sticker_due,
  };
}

type WorkOrderRow = Database["public"]["Tables"]["work_orders"]["Row"];

export function mapWorkOrder(row: WorkOrderRow): WorkOrder {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    title: row.title,
    description: row.description,
    status: row.status as WorkOrderStatus,
    priority: row.priority as WorkOrderPriority,
    woType: row.wo_type as WorkOrder["woType"],
    assetId: row.asset_id,
    assetName: row.asset_name,
    linkedEntityType: row.linked_entity_type as WorkOrder["linkedEntityType"],
    assignedToId: row.assigned_to_id,
    assignedToName: row.assigned_to_name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assignedToIds: Array.isArray((row as any).assigned_to_ids) ? ((row as any).assigned_to_ids as string[]) : [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assignedToNames: Array.isArray((row as any).assigned_to_names) ? ((row as any).assigned_to_names as string[]) : [],
    dueDate: row.due_date,
    category: row.category,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    categories: Array.isArray((row as any).categories) ? ((row as any).categories as string[]) : (row.category ? [row.category] : []),
    workOrderNumber: row.work_order_number,
    parentWorkOrderId: row.parent_work_order_id,
    pmScheduleId: row.pm_schedule_id,
    isRecurring: row.is_recurring,
    recurrenceFrequency: row.recurrence_frequency as WorkOrder["recurrenceFrequency"],
    automationId: row.automation_id ?? null,
  };
}

type PMScheduleRow = Database["public"]["Tables"]["pm_schedules"]["Row"];

export function mapPMSchedule(row: PMScheduleRow): PMSchedule {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    title: row.title,
    assetId: row.asset_id ?? "",
    assetName: row.asset_name,
    frequency: row.frequency as PMSchedule["frequency"],
    nextDueDate: row.next_due_date,
    lastCompletedDate: row.last_completed_date,
    isActive: row.is_active,
    description: row.description,
  };
}

type MeterRow = Database["public"]["Tables"]["meters"]["Row"];

export function mapMeter(row: MeterRow): Meter {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    name: row.name,
    assetId: row.asset_id ?? "",
    assetName: row.asset_name,
    unit: row.unit,
    currentValue: row.current_value,
    lastReadingAt: row.last_reading_at ?? row.created_at,
    source: row.source as "manual" | "samsara",
  };
}

type MeterReadingRow = Database["public"]["Tables"]["meter_readings"]["Row"];

export function mapMeterReading(row: MeterReadingRow): MeterReading {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    meterId: row.meter_id,
    value: row.value,
    readingAt: row.reading_at,
    source: row.source as "manual" | "samsara",
    recordedByName: row.recorded_by_name,
  };
}

type AssetPartRow = Database["public"]["Tables"]["asset_parts"]["Row"];

export function mapAssetPart(row: AssetPartRow): AssetPart {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    assetId: row.asset_id,
    partId: row.part_id,
    partName: row.part_name,
    partNumber: row.part_number,
  };
}

type GoodsReceiptRow = Database["public"]["Tables"]["goods_receipts"]["Row"];
type GoodsReceiptLineRow = Database["public"]["Tables"]["goods_receipt_lines"]["Row"];

function mapGoodsReceiptLine(row: GoodsReceiptLineRow): GoodsReceiptLine {
  return {
    id: row.id,
    lineItemId: row.po_line_item_id ?? "",
    productItemName: row.product_item_name,
    partNumber: row.part_number,
    quantityOrdered: row.quantity_ordered,
    quantityReceived: row.quantity_received,
    quantityRemaining: row.quantity_remaining,
    unitCost: row.unit_cost,
    isMaintPart: row.is_maint_part,
  };
}

export function mapGoodsReceipt(
  row: GoodsReceiptRow & { goods_receipt_lines?: GoodsReceiptLineRow[] }
): GoodsReceipt {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    receiptNumber: row.receipt_number,
    purchaseOrderId: row.purchase_order_id,
    poNumber: row.po_number,
    vendorName: row.vendor_name,
    receivedById: row.received_by_id ?? "",
    receivedByName: row.received_by_name,
    receivedAt: row.received_at,
    subtotal: row.subtotal,
    taxRatePercent: row.tax_rate_percent as number,
    salesTax: row.sales_tax,
    shippingCost: row.shipping_cost,
    grandTotal: row.grand_total,
    notes: row.notes,
    lines: (row.goods_receipt_lines ?? []).map(mapGoodsReceiptLine),
  };
}

type MaintenanceRequestRow = Database["public"]["Tables"]["maintenance_requests"]["Row"];

export function mapMaintenanceRequest(row: MaintenanceRequestRow): MaintenanceRequest {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    requestNumber: row.request_number,
    title: row.title,
    description: row.description,
    status: row.status as MaintenanceRequestStatus,
    priority: row.priority as WorkOrderPriority,
    assetId: row.asset_id,
    assetName: row.asset_name,
    requestedById: row.requested_by_id ?? "",
    requestedByName: row.requested_by_name,
    linkedWorkOrderId: row.linked_work_order_id,
    linkedWorkOrderNumber: row.linked_work_order_number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    automationId: (row as any).automation_id ?? null,
  };
}

type AttachmentRow = Database["public"]["Tables"]["attachments"]["Row"];

export function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    recordType: row.record_type as AttachmentRecordType,
    recordId: row.record_id,
    fileName: row.file_name,
    fileSize: row.file_size,
    fileType: row.file_type,
    storagePath: row.storage_path,
    uploadedByName: row.uploaded_by_name,
  };
}

type AuditLogRow = Database["public"]["Tables"]["audit_log"]["Row"];

export function mapAuditEntry(row: AuditLogRow): AuditEntry {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: null,
    recordType: row.record_type as AuditRecordType,
    recordId: row.record_id,
    action: row.action as AuditAction,
    changedByName: row.changed_by_name,
    description: row.description,
    fieldChanged: row.field_changed,
    oldValue: row.old_value,
    newValue: row.new_value,
  };
}

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export function mapOrgUser(row: ProfileRow): OrgUser {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    avatarUrl: row.avatar_url,
    status: (((row as unknown as Record<string, unknown>).status as string | undefined) ?? "active") as OrgUser["status"],
    createdAt: row.created_at,
  };
}

type WOPartRow = Database["public"]["Tables"]["wo_parts"]["Row"];

export function mapWOPart(row: WOPartRow): WOPart {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    workOrderId: row.work_order_id,
    partId: row.part_id ?? "",
    partName: row.part_name,
    partNumber: row.part_number,
    quantity: row.quantity,
    unitCost: row.unit_cost,
  };
}

type WOLaborEntryRow = Database["public"]["Tables"]["wo_labor_entries"]["Row"];

export function mapWOLaborEntry(row: WOLaborEntryRow): WOLaborEntry {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    workOrderId: row.work_order_id,
    technicianName: row.technician_name,
    description: row.description,
    hours: row.hours,
    hourlyRate: row.hourly_rate,
  };
}

type WOVendorChargeRow = Database["public"]["Tables"]["wo_vendor_charges"]["Row"];

export function mapWOVendorCharge(row: WOVendorChargeRow): WOVendorCharge {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    workOrderId: row.work_order_id,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    description: row.description,
    cost: row.cost,
  };
}

// pm_schedule_parts — table not yet in generated types; use loose row type until `supabase gen types` is re-run
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPMPart(row: Record<string, any>): PMPart {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    pmScheduleId: row.pm_schedule_id,
    partId: row.part_id ?? "",
    partName: row.part_name,
    partNumber: row.part_number,
    quantity: row.quantity,
    unitCost: row.unit_cost,
  };
}
