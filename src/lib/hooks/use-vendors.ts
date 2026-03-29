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
      return data.map(mapVendor);
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
      const { data, error } = await supabase
        .from("vendors")
        .insert({
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

export function useDeleteVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
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
