import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapVendor } from "@/lib/supabase/mappers";
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
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();
      const inserts = rows
        .filter((r) => r.name?.trim())
        .map((r) => ({
          name: r.name.trim(),
          contact_name: r.contactName?.trim() || "",
          email: r.email?.trim() || "",
          phone: r.phone?.trim() || "",
          address: r.address?.trim() || "",
          website: r.website?.trim() || null,
          notes: r.notes?.trim() || null,
          vendor_type: r.vendorType?.trim() || null,
          is_active: r.isActive?.toLowerCase() !== "false",
        }));
      if (inserts.length === 0) return 0;

      // Insert one-by-one; on duplicate name, update the existing row
      let count = 0;
      for (const row of inserts) {
        const { error } = await supabase.from("vendors").insert(row);
        if (error?.code === "23505") {
          const { data: { user } } = await supabase.auth.getUser();
          const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user!.id).single();
          await supabase.from("vendors").update({
            contact_name: row.contact_name,
            email: row.email,
            phone: row.phone,
            address: row.address,
            website: row.website,
            notes: row.notes,
            vendor_type: row.vendor_type,
            is_active: row.is_active,
          }).eq("name", row.name).eq("org_id", profile!.org_id).is("deleted_at", null);
        } else if (error) {
          throw error;
        }
        count++;
      }
      return count;
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

      const blockers: string[] = [];
      if (openPOCount) blockers.push(`${openPOCount} open purchase order${openPOCount === 1 ? "" : "s"}`);
      if (openReqCount) blockers.push(`${openReqCount} open requisition${openReqCount === 1 ? "" : "s"}`);
      if (blockers.length > 0) {
        throw new Error(`Cannot delete vendor — it has ${blockers.join(" and ")}`);
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
