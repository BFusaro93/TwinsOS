"use client";

import { useCurrentUserStore } from "@/stores/current-user-store";

/**
 * What the current app role (profiles.role) may do in the UI. Mirrors the
 * database's role_write_guard_* RLS policies and the viewer/requestor checks
 * in the SECURITY DEFINER writers — the database is the enforcement, this
 * only hides controls that would fail anyway.
 *
 * These are EQUIPT roles. Landscapt screens follow the Landscapt role
 * (crm_roles permissions via usePermissions), not these.
 *
 *   viewer    — read-only in Equipt.
 *   requestor — may create maintenance requests (edit/delete their own) and
 *               keep their OWN requisitions in draft (plus line items);
 *               can't submit for approval; may comment/attach on their own
 *               records; everything else read-only.
 *   purchaser — work orders (parts, labor, vendor charges, status) are
 *               read-only; everything else unchanged.
 *
 * Admin / manager / technician / crew are unrestricted here.
 *
 * While the profile is still loading the store holds a placeholder "viewer"
 * user; every capability reports TRUE until `currentUserLoaded`, so full-access
 * users never see controls flash away (the DB still refuses a limited user
 * who clicks during that first moment).
 */

/** Anything with an owner. `createdBy` is the row's created_by; requisitions
 * and maintenance requests also count `requestedById`, matching the RLS. */
/** comments / attachments record types that belong to Equipt — the only ones
 * the role limits apply to (mirrors 20260929140000_scope_limited_roles_to_equipt). */
const EQUIPT_RECORD_TYPES = new Set<string>([
  "po", "purchase_order", "requisition", "work_order", "receiving", "vehicle", "request",
  "maintenance_request", "asset", "vendor", "pm_schedule", "part", "product", "product_item", "meter",
]);

export function isEquiptRecordType(recordType: string): boolean {
  return EQUIPT_RECORD_TYPES.has(recordType);
}

export interface OwnedRecord {
  createdBy?: string | null;
  requestedById?: string | null;
}

export interface OwnedDraftRecord extends OwnedRecord {
  status: string;
}

export interface RoleCapabilities {
  /** Profile has loaded — role flags below are real, not the placeholder. */
  loaded: boolean;
  isViewer: boolean;
  isRequestor: boolean;
  isPurchaser: boolean;
  /** viewer: every write control hidden. */
  isReadOnly: boolean;
  /** General Equipt writes (assets, parts, products, vendors, PM schedules,
   * POs, receiving, meters, imports, …). False for viewer + requestor. */
  canWriteEquipt: boolean;
  /** Work orders and their parts / labor / vendor charges / status / sub-WOs.
   * False for viewer, requestor and purchaser. */
  canEditWorkOrders: boolean;
  canCreatePO: boolean;
  canReceive: boolean;
  canManageInventory: boolean;
  canCreateRequisition: boolean;
  /** Submit a requisition / PO for approval (and approve / reject). */
  canSubmitForApproval: boolean;
  canCreateMaintenanceRequest: boolean;
  /** Approve / reject / convert a maintenance request into a work order. */
  canTriageMaintenanceRequests: boolean;
  isOwn: (record: OwnedRecord | null | undefined) => boolean;
  /** Edit / delete a requisition header or its line items. */
  canEditRequisition: (req: OwnedDraftRecord | null | undefined) => boolean;
  /** Edit / delete a maintenance request. */
  canEditMaintenanceRequest: (req: OwnedRecord | null | undefined) => boolean;
  /** Comment on / attach to a record. `record` is the parent (e.g. the
   * requisition) — a requestor may only do so on their own records. */
  canComment: (record?: OwnedRecord | null) => boolean;
}

export function useRoleCapabilities(): RoleCapabilities {
  const currentUser = useCurrentUserStore((s) => s.currentUser);
  const loaded = useCurrentUserStore((s) => s.currentUserLoaded);

  const role = loaded ? currentUser.role : null;
  const userId = currentUser.id;
  const isViewer = role === "viewer";
  const isRequestor = role === "requestor";
  const isPurchaser = role === "purchaser";

  const canWriteEquipt = !isViewer && !isRequestor;
  const canEditWorkOrders = canWriteEquipt && !isPurchaser;

  const isOwn = (record: OwnedRecord | null | undefined): boolean => {
    if (!record || !userId) return false;
    return record.createdBy === userId || record.requestedById === userId;
  };

  return {
    loaded,
    isViewer,
    isRequestor,
    isPurchaser,
    isReadOnly: isViewer,
    canWriteEquipt,
    canEditWorkOrders,
    canCreatePO: canWriteEquipt,
    canReceive: canWriteEquipt,
    canManageInventory: canWriteEquipt,
    canCreateRequisition: !isViewer,
    canSubmitForApproval: canWriteEquipt,
    canCreateMaintenanceRequest: !isViewer,
    canTriageMaintenanceRequests: canEditWorkOrders,
    isOwn,
    canEditRequisition: (req) => {
      if (canWriteEquipt) return true;
      if (!isRequestor || !req) return false;
      return isOwn(req) && req.status === "draft";
    },
    canEditMaintenanceRequest: (req) => {
      if (canWriteEquipt) return true;
      return isRequestor && isOwn(req);
    },
    canComment: (record) => {
      if (canWriteEquipt) return true;
      return isRequestor && isOwn(record);
    },
  };
}
