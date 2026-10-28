import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { mapMeter } from "@/lib/supabase/mappers";
import type { Meter } from "@/types/cmms";

export function useMeters() {
  return useQuery({
    queryKey: ["meters"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("meters").select("*").is("deleted_at", null).order("name");
      if (error) throw error;
      return (data.map(mapMeter)) as Meter[];
    },
  });
}

export function useMeter(id: string) {
  return useQuery({
    queryKey: ["meters", id],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("meters").insert({
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
    onError: (err) => console.error("[useCreateMeter]", err),
  });
}

export function useUpdateMeter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Meter> & { id: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("meters").update({
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("meters").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;

      // Same cleanup useDeleteAsset does for its meters: a meter-threshold
      // automation pointing at a deleted meter would otherwise stay enabled
      // but dead (the runner just skips it as "meter not found" every 15 min).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: autos } = await (supabase as any)
        .from("automations")
        .select("id, trigger_config")
        .eq("trigger_type", "meter_threshold")
        .eq("enabled", true)
        .is("deleted_at", null);
      const toDisable = ((autos ?? []) as { id: string; trigger_config: Record<string, unknown> | null }[])
        .filter((a) => String(a.trigger_config?.meter_id ?? "") === id)
        .map((a) => a.id);
      if (toDisable.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("automations").update({ enabled: false }).in("id", toDisable);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meters"] });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });
}
