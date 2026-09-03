import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapMeterReading } from "@/lib/supabase/mappers";
import type { MeterReading } from "@/types/cmms";

export function useMeterReadings(meterId: string | null) {
  return useQuery({
    queryKey: ["meter-readings", meterId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("meter_readings")
        .select("*")
        .eq("meter_id", meterId!)
        .is("deleted_at", null)
        .order("reading_at", { ascending: true });
      if (error) throw error;
      return (data.map(mapMeterReading)) as MeterReading[];
    },
    enabled: !!meterId,
  });
}

export function useAddMeterReading() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<MeterReading, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("meter_readings").insert({
        meter_id: input.meterId,
        value: input.value,
        reading_at: input.readingAt,
        source: input.source,
        recorded_by_name: input.recordedByName,
        notes: input.notes,
      }).select().single();
      if (error) throw error;

      // meters.current_value / last_reading_at are denormalized off the
      // most recent reading by reading_at, not off whichever reading was
      // most recently inserted. A backdated reading (readingAt earlier than
      // an existing reading) must NOT clobber the meter's current value —
      // recompute from the actual latest remaining reading, same pattern as
      // useDeleteMeterReading below.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: latest, error: latestError } = await db
        .from("meter_readings")
        .select("value, reading_at")
        .eq("meter_id", input.meterId)
        .is("deleted_at", null)
        .order("reading_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      if (latest) {
        const { error: updateError } = await db
          .from("meters")
          .update({ current_value: latest.value, last_reading_at: latest.reading_at })
          .eq("id", input.meterId);
        if (updateError) throw updateError;
      }
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
          queryClient.invalidateQueries({ queryKey: ["requests"] });
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { error } = await db
        .from("meter_readings")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      // meters.current_value / last_reading_at are denormalized off the most
      // recent reading (see useAddMeterReading). Deleting a reading can
      // delete the one that set those fields, so recompute from whatever
      // reading is now the most recent — otherwise the meter keeps showing a
      // value that no longer has a backing reading. If no readings remain,
      // leave the meter's fields alone (no baseline to fall back to).
      const { data: latest, error: latestError } = await db
        .from("meter_readings")
        .select("value, reading_at")
        .eq("meter_id", meterId)
        .is("deleted_at", null)
        .order("reading_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      if (latest) {
        const { error: updateError } = await db
          .from("meters")
          .update({ current_value: latest.value, last_reading_at: latest.reading_at })
          .eq("id", meterId);
        if (updateError) throw updateError;
      }
      return meterId;
    },
    onSuccess: (meterId) => {
      queryClient.invalidateQueries({ queryKey: ["meter-readings", meterId] });
      queryClient.invalidateQueries({ queryKey: ["meters"] });
      queryClient.invalidateQueries({ queryKey: ["meters", meterId] });
    },
  });
}
