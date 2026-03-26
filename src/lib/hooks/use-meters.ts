import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapMeter } from "@/lib/supabase/mappers";
import type { Meter } from "@/types/cmms";

export function useMeters() {
  return useQuery({
    queryKey: ["meters"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("meters").select("*").is("deleted_at", null).order("name");
      if (error) throw error;
      return data.map(mapMeter);
    },
  });
}

export function useMeter(id: string) {
  return useQuery({
    queryKey: ["meters", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("meters").select("*").eq("id", id).is("deleted_at", null).single();
      if (error) throw error;
      return mapMeter(data);
    },
    enabled: !!id,
  });
}

export function useCreateMeter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Meter, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("meters").insert({
        name: input.name,
        asset_id: input.assetId,
        asset_name: input.assetName,
        unit: input.unit,
        current_value: input.currentValue,
        last_reading_at: input.lastReadingAt,
        source: input.source,
      }).select().single();
      if (error) throw error;
      return mapMeter(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meters"] }),
  });
}

export function useUpdateMeter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Meter> & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("meters").update({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.assetId !== undefined && { asset_id: input.assetId }),
        ...(input.assetName !== undefined && { asset_name: input.assetName }),
        ...(input.unit !== undefined && { unit: input.unit }),
        ...(input.currentValue !== undefined && { current_value: input.currentValue }),
        ...(input.lastReadingAt !== undefined && { last_reading_at: input.lastReadingAt }),
        ...(input.source !== undefined && { source: input.source }),
      }).eq("id", id).select().single();
      if (error) throw error;
      return mapMeter(data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["meters"] });
      queryClient.invalidateQueries({ queryKey: ["meters", id] });
    },
  });
}

export function useDeleteMeter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("meters").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meters"] }),
  });
}
