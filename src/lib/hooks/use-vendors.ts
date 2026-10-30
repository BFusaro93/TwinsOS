import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { mapVendor } from "@/lib/supabase/mappers";
import type { BulkImportResult } from "@/lib/csv";
import type { Vendor } from "@/types";

export function useVendors() {
  return useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data.map(mapVendor)) as Vendor[];
    },
  });
}

export function useVendor(id: string) {
  return useQuery({
    queryKey: ["vendors", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapVendor(data);
    },
    enabled: !!id,
  });
}

export function useCreateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<Vendor, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">
    ) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("vendors")
        .insert({
          created_by: user?.id ?? null,
          name: input.name,
          contact_name: input.contactName,
          email: input.email,
          phone: input.phone,
          address: input.address,
          city: input.city,
          state: input.state,
          zip: input.zip,
          website: input.website,
          notes: input.notes,
          vendor_type: input.vendorType,
          is_active: input.isActive,
          w9_status: input.w9Status,
          w9_received_date: input.w9ReceivedDate,
          w9_expiration_date: input.w9ExpirationDate,
        })
        .select()
        .single();
      if (error) throw error;
      return mapVendor(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
  });
}

export function useUpdateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Vendor> & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("vendors")
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.contactName !== undefined && { contact_name: input.contactName }),
          ...(input.email !== undefined && { email: input.email }),
          ...(input.phone !== undefined && { phone: input.phone }),
          ...(input.address !== undefined && { address: input.address }),
          ...(input.city !== undefined && { city: input.city }),
          ...(input.state !== undefined && { state: input.state }),
          ...(input.zip !== undefined && { zip: input.zip }),
          ...(input.website !== undefined && { website: input.website }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.vendorType !== undefined && { vendor_type: input.vendorType }),
          ...(input.isActive !== undefined && { is_active: input.isActive }),
          ...(input.w9Status !== undefined && { w9_status: input.w9Status }),
          ...(input.w9ReceivedDate !== undefined && { w9_received_date: input.w9ReceivedDate }),
          ...(input.w9ExpirationDate !== undefined && { w9_expiration_date: input.w9ExpirationDate }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapVendor(data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      queryClient.invalidateQueries({ queryKey: ["vendors", id] });
    },
  });
}

/**
 * Bulk-inserts vendors from a CSV import.
 * Rows missing `name` are silently skipped.
 */
export function useBulkImportVendors() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]): Promise<BulkImportResult> => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user!.id).single();

      const failed: BulkImportResult["failed"] = [];
      const inserts: { rowNum: number; hasActiveFlag: boolean; row: ReturnType<typeof buildRow> }[] = [];
      function buildRow(r: Record<string, string>) {
        return {
          name: r.name.trim(),
          contact_name: r.contactName?.trim() || "",
          email: r.email?.trim() || "",
          phone: r.phone?.trim() || "",
          address: r.address?.trim() || "",
          city: r.city?.trim() || "",
          state: r.state?.trim() || "",
          zip: r.zip?.trim() || "",
          website: r.website?.trim() || null,
          notes: r.notes?.trim() || null,
          vendor_type: r.vendorType?.trim() || null,
          // The export writes "Active" / "Inactive"; anything that reads as
          // "no" must stay inactive on a round trip (only "false" used to).
          is_active: !["false", "inactive", "no", "n", "0"].includes(r.isActive?.trim().toLowerCase() ?? ""),
        };
      }
      rows.forEach((r, i) => {
        if (!r.name?.trim()) {
          failed.push({ row: i + 1, error: "Missing required field: Name" });
          return;
        }
        inserts.push({ rowNum: i + 1, hasActiveFlag: !!r.isActive?.trim(), row: buildRow(r) });
      });
      if (inserts.length === 0) return { succeeded: 0, failed };

      // vendors has no unique index on name, so a duplicate never raised
      // 23505 and re-importing a list (or repeating a name inside one file)
      // silently created a second vendor per row. Match existing vendors by
      // trimmed, case-insensitive name and update them instead — the same
      // normalization NewVendorDialog's duplicate check uses.
      const { data: existing } = await supabase.from("vendors").select("id, name").eq("org_id", profile!.org_id).is("deleted_at", null);
      const idByName = new Map<string, string>();
      for (const v of existing ?? []) {
        const key = v.name.trim().toLowerCase();
        if (!idByName.has(key)) idByName.set(key, v.id as string);
      }

      // A bad row used to throw out of the loop: every later row was dropped
      // and the earlier ones stayed imported with only an opaque error shown.
      let succeeded = 0;
      for (const { rowNum, hasActiveFlag, row } of inserts) {
        const key = row.name.toLowerCase();
        const existingId = idByName.get(key);
        if (existingId) {
          // Only the cells the CSV filled in: a name-only (or partial) file
          // must not blank an existing vendor's contact details or
          // reactivate an inactive one.
          const patch = {
            ...(row.contact_name && { contact_name: row.contact_name }),
            ...(row.email && { email: row.email }),
            ...(row.phone && { phone: row.phone }),
            ...(row.address && { address: row.address }),
            ...(row.city && { city: row.city }),
            ...(row.state && { state: row.state }),
            ...(row.zip && { zip: row.zip }),
            ...(row.website && { website: row.website }),
            ...(row.notes && { notes: row.notes }),
            ...(row.vendor_type && { vendor_type: row.vendor_type }),
            ...(hasActiveFlag && { is_active: row.is_active }),
          };
          if (Object.keys(patch).length > 0) {
            const { error } = await supabase.from("vendors").update(patch).eq("id", existingId);
            if (error) {
              failed.push({ row: rowNum, error: `"${row.name}": ${error.message}` });
              continue;
            }
          }
        } else {
          const { data: created, error } = await supabase.from("vendors").insert(row).select("id").single();
          if (error) {
            failed.push({ row: rowNum, error: `"${row.name}": ${error.message}` });
            continue;
          }
          idByName.set(key, created.id as string);
        }
        succeeded++;
      }
      return { succeeded, failed };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vendors"] }),
  });
}

/**
 * Purchase Order statuses that represent a PO still in flight (not yet
 * finalized). Kept in sync with POStatus in src/types/purchase-order.ts.
 */
const OPEN_PO_STATUSES = ["requested", "pending", "approved", "ordered", "partially_fulfilled"];

/**
 * Requisition statuses that represent a requisition still in flight. Once a
 * requisition is "ordered" or "closed" it has handed off to its own
 * Purchase Order (checked separately via OPEN_PO_STATUSES), so those two —
 * plus "rejected" — are terminal here. Kept in sync with ApprovalStatus in
 * src/types/common.ts.
 */
const OPEN_REQUISITION_STATUSES = ["draft", "pending_approval", "approved"];

export function useDeleteVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();

      // Vendors are shared between PO and CMMS (see CLAUDE.md) — a vendor
      // still tied to an open Purchase Order or Requisition would silently
      // vanish from any query that filters vendors by deleted_at, blanking
      // its name on in-flight records the user still needs to see. Block
      // the delete instead of letting that happen.
      const [{ count: openPOCount, error: poErr }, { count: openReqCount, error: reqErr }] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", id)
          .is("deleted_at", null)
          .in("status", OPEN_PO_STATUSES),
        supabase
          .from("requisitions")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", id)
          .is("deleted_at", null)
          .in("status", OPEN_REQUISITION_STATUSES),
      ]);
      if (poErr) throw poErr;
      if (reqErr) throw reqErr;

      // Other live records that reference this vendor by FK. Soft-deleting the
      // vendor would blank its name on all of them, so block with a clear
      // message (checked against the real FK columns).
      const refChecks: Array<{ label: string; table: string; column: string }> = [
        { label: "project subcontract cost", table: "project_subcontract_costs", column: "vendor_id" },
        { label: "work order vendor charge", table: "wo_vendor_charges", column: "vendor_id" },
        { label: "part with this default vendor", table: "parts", column: "vendor_id" },
        { label: "product with this default vendor", table: "product_items", column: "vendor_id" },
        { label: "damage case expense", table: "damage_case_expenses", column: "vendor_id" },
        { label: "asset purchased from this vendor", table: "assets", column: "purchase_vendor_id" },
        { label: "vehicle purchased from this vendor", table: "vehicles", column: "purchase_vendor_id" },
      ];
      const refResults = await Promise.all(
        refChecks.map(async (c) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count, error: refErr } = await (supabase as any)
            .from(c.table)
            .select("id", { count: "exact", head: true })
            .eq(c.column, id)
            .is("deleted_at", null);
          if (refErr) throw refErr;
          return { label: c.label, count: (count ?? 0) as number };
        })
      );

      const blockers: string[] = [];
      for (const r of refResults) {
        if (r.count > 0) blockers.push(`${r.count} ${r.label}${r.count === 1 ? "" : "s"}`);
      }
      if (openPOCount) blockers.push(`${openPOCount} open purchase order${openPOCount === 1 ? "" : "s"}`);
      if (openReqCount) blockers.push(`${openReqCount} open requisition${openReqCount === 1 ? "" : "s"}`);
      if (blockers.length > 0) {
        throw new Error(`Cannot delete vendor — it is still referenced by ${blockers.join(", ")}`);
      }

      const { error } = await supabase
        .from("vendors")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
  });
}
