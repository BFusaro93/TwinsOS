import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapMeterReading } from "@/lib/supabase/mappers";
import type { MeterReading } from "@/types/cmms";

export function useMeterReadings(meterId: string | null) {
  return useQuery({
    queryKey: ["meter-readings", meterId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("meter_readings")
        .select("*")
        .eq("meter_id", meterId!)
        .is("deleted_at", null)
        .order("reading_at", { ascending: true });
      if (error) throw error;
      return data.map(mapMeterReading);
    },
    enabled: !!meterId,
  });
}

export function useAddMeterReading() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<MeterReading, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("meter_readings").insert({
        meter_id: input.meterId,
        value: input.value,
        reading_at: input.readingAt,
        source: input.source,
        recorded_by_name: input.recordedByName,
      }).select().single();
      if (error) throw error;
      await supabase.from("meters").update({
        current_value: input.value,
        last_reading_at: input.readingAt,
      }).eq("id", input.meterId);
      return mapMeterReading(data);
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["meter-readings", input.meterId] });
      queryClient.invalidateQueries({ queryKey: ["meters"] });
      // Fire-and-forget: check if any automations should trigger for this org
      // now that the meter value has changed. Errors are non-fatal.
      fetch("/api/automations/run", { method: "POST" })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["work-orders"] });
          queryClient.invalidateQueries({ queryKey: ["maintenance-requests"] });
          queryClient.invalidateQueries({ queryKey: ["automations"] });
        })
        .catch(() => {});
    },
  });
}

export function useDeleteMeterReading() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, meterId }: { id: string; meterId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("meter_readings")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return meterId;
    },
    onSuccess: (meterId) => {
      queryClient.invalidateQueries({ queryKey: ["meter-readings", meterId] });
    },
  });
}
