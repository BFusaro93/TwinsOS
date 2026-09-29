import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
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

      // Meters (hours, odometer) only count up, and meter automations fire
      // on the latest value — a typo'd low reading (or a backdated one out of
      // order) would re-arm or mis-fire a rule and corrupt the history. There
      // is no "meter replaced / rolled over" flag on meters, so a lower value
      // is rejected outright; a replaced meter gets a new meter record.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const readDb = supabase as any;
      const [{ data: before, error: beforeErr }, { data: after, error: afterErr }] = await Promise.all([
        readDb
          .from("meter_readings")
          .select("value, reading_at")
          .eq("meter_id", input.meterId)
          .is("deleted_at", null)
          .lte("reading_at", input.readingAt)
          .order("reading_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        readDb
          .from("meter_readings")
          .select("value, reading_at")
          .eq("meter_id", input.meterId)
          .is("deleted_at", null)
          .gt("reading_at", input.readingAt)
          .order("value", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      if (beforeErr) throw beforeErr;
      if (afterErr) throw afterErr;
      if (before && Number(input.value) < Number(before.value)) {
        throw new Error(
          `This reading (${input.value}) is lower than the previous one (${Number(before.value)}). Meter readings can't go down — check the value, or add a new meter if this one was replaced.`
        );
      }
      if (after && Number(input.value) > Number(after.value)) {
        throw new Error(
          `This reading (${input.value}) is higher than a later reading (${Number(after.value)}). Check the value or the reading date.`
        );
      }

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
