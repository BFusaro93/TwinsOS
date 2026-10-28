import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { mapMeter } from "@/lib/supabase/mappers";
import type { Meter } from "@/types/cmms";
import { addMeterReadingCore } from "@/lib/hooks/use-meter-readings";

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
        kind: input.kind,
        capacity: input.kind === "level" ? input.capacity : null,
      }).select().single();
      if (error) throw error;

      // A non-zero starting value needs a baseline reading, otherwise the
      // first real reading is validated against nothing and the history
      // doesn't explain where the meter's value came from. Goes through the
      // shared reading path so the recompute rules stay identical.
      if (Number(input.currentValue) > 0) {
        try {
          await addMeterReadingCore({
            meterId: data.id,
            value: Number(input.currentValue),
            readingAt: input.lastReadingAt || new Date().toISOString(),
            source: input.source,
            recordedByName: null,
            notes: "Initial reading",
          });
        } catch (readingErr) {
          // Don't leave a meter whose value has no backing reading.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("meters").update({ deleted_at: new Date().toISOString() }).eq("id", data.id);
          throw readingErr;
        }
      }
      return mapMeter(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meters"] });
      queryClient.invalidateQueries({ queryKey: ["meter-readings"] });
    },
    onError: (err) => console.error("[useCreateMeter]", err),
  });
}

export function useUpdateMeter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Meter> & { id: string }) => {
      const supabase = createClient();

      // Kind decides which reading rules apply, so it is locked once the meter
      // has any reading (a baseline reading counts). Capacity is level-only and
      // must still contain the current value.
      if (input.kind !== undefined || input.capacity !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: cur, error: curErr } = await (supabase as any)
          .from("meters").select("kind, current_value").eq("id", id).single();
        if (curErr) throw curErr;
        if (input.kind !== undefined && input.kind !== cur.kind) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count, error: cntErr } = await (supabase as any)
            .from("meter_readings").select("id", { count: "exact", head: true })
            .eq("meter_id", id).is("deleted_at", null);
          if (cntErr) throw cntErr;
          if ((count ?? 0) > 0) throw new Error("A meter's kind can't be changed once it has readings.");
        }
        const nextKind = input.kind ?? cur.kind;
        if (nextKind === "level" && input.capacity != null) {
          if (!(input.capacity > 0)) throw new Error("Capacity must be greater than 0.");
          const nextValue = input.currentValue ?? Number(cur.current_value);
          if (nextValue > input.capacity) throw new Error(`Capacity (${input.capacity}) can't be below the current level (${nextValue}).`);
        }
      }

      // current_value is denormalized off meter_readings, so a direct edit
      // must go through the reading path (same no-decrease / ordering rules)
      // instead of overwriting the column — otherwise the next reading's
      // recompute silently reverts it. A value equal to the current one is a
      // no-op; a lower one is rejected by the reading rules with a clear error.
      if (input.currentValue !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: cur, error: curErr } = await (supabase as any)
          .from("meters").select("current_value, source").eq("id", id).single();
        if (curErr) throw curErr;
        if (Number(cur.current_value) !== Number(input.currentValue)) {
          await addMeterReadingCore({
            meterId: id,
            value: Number(input.currentValue),
            readingAt: new Date().toISOString(),
            source: input.source ?? cur.source ?? "manual",
            recordedByName: null,
            notes: "Manual meter edit",
          });
        }
      }
      const patch = {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.assetId !== undefined && { asset_id: input.assetId }),
        ...(input.assetName !== undefined && { asset_name: input.assetName }),
        ...(input.unit !== undefined && { unit: input.unit }),
        // current_value / last_reading_at are owned by the reading path above.
        ...(input.source !== undefined && { source: input.source }),
        ...(input.kind !== undefined && { kind: input.kind, ...(input.kind === "cumulative" && { capacity: null }) }),
        ...(input.capacity !== undefined && input.kind !== "cumulative" && { capacity: input.capacity }),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = (supabase as any).from("meters");
      const { data, error } = Object.keys(patch).length > 0
        ? await table.update(patch).eq("id", id).select().single()
        : await table.select("*").eq("id", id).single();
      if (error) throw error;
      return mapMeter(data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["meters"] });
      queryClient.invalidateQueries({ queryKey: ["meters", id] });
      queryClient.invalidateQueries({ queryKey: ["meter-readings", id] });
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
