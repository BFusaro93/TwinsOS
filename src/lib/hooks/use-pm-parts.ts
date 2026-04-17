import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapPMPart } from "@/lib/supabase/mappers";
import type { PMPart } from "@/types/cmms";

// ── PM Schedule Parts ─────────────────────────────────────────────────────────

export function usePMParts(pmScheduleId: string) {
  return useQuery({
    queryKey: ["pm-parts", pmScheduleId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pm_schedule_parts")
        .select("*")
        .eq("pm_schedule_id", pmScheduleId)
        .is("deleted_at", null);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map(mapPMPart);
    },
    enabled: !!pmScheduleId,
  });
}

export function useAddPMPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      pmScheduleId: string;
      partId: string | null;
      partName: string;
      partNumber: string;
      quantity: number;
      unitCost: number;
    }): Promise<PMPart> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pm_schedule_parts")
        .insert({
          pm_schedule_id: input.pmScheduleId,
          part_id: input.partId || null,
          part_name: input.partName,
          part_number: input.partNumber,
          quantity: input.quantity,
          unit_cost: input.unitCost,
        })
        .select()
        .single();
      if (error) throw error;
      return mapPMPart(data);
    },
    onSuccess: (_, { pmScheduleId }) => {
      queryClient.invalidateQueries({ queryKey: ["pm-parts", pmScheduleId] });
    },
  });
}

export function useUpdatePMPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      pmScheduleId,
      quantity,
      unitCost,
    }: {
      id: string;
      pmScheduleId: string;
      quantity: number;
      unitCost: number;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("pm_schedule_parts")
        .update({ quantity, unit_cost: unitCost })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { pmScheduleId }) => {
      queryClient.invalidateQueries({ queryKey: ["pm-parts", pmScheduleId] });
    },
  });
}

export function useDeletePMPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      pmScheduleId,
    }: {
      id: string;
      pmScheduleId: string;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("pm_schedule_parts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return pmScheduleId;
    },
    onSuccess: (pmScheduleId) => {
      queryClient.invalidateQueries({ queryKey: ["pm-parts", pmScheduleId] });
    },
  });
}
