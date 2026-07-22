"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface OverheadSettings {
  id: string | null;
  laborOhBps: number;
  laborBurdenBps: number;
  contractOhBps: number;
  equipmentOhBps: number;
  materialsOhBps: number;
  otherOhBps: number;
}

export const OVERHEAD_SETTINGS_DEFAULTS: OverheadSettings = {
  id: null,
  laborOhBps: 0,
  laborBurdenBps: 0,
  contractOhBps: 0,
  equipmentOhBps: 0,
  materialsOhBps: 0,
  otherOhBps: 0,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): OverheadSettings {
  return {
    id: row.id,
    laborOhBps: row.labor_oh_bps ?? 0,
    laborBurdenBps: row.labor_burden_bps ?? 0,
    contractOhBps: row.contract_oh_bps ?? 0,
    equipmentOhBps: row.equipment_oh_bps ?? 0,
    materialsOhBps: row.materials_oh_bps ?? 0,
    otherOhBps: row.other_oh_bps ?? 0,
  };
}

export function useOverheadSettings() {
  return useQuery({
    queryKey: ["overhead-settings"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (profileError) throw profileError;

      const { data, error } = await supabase
        .from("crm_overhead_settings")
        .select("*")
        .eq("org_id", profile.org_id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapRow(data) : OVERHEAD_SETTINGS_DEFAULTS;
    },
  });
}

export function useUpsertOverheadSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Omit<OverheadSettings, "id">) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (profileError) throw profileError;

      const { error } = await supabase
        .from("crm_overhead_settings")
        .upsert(
          {
            org_id: profile.org_id,
            labor_oh_bps: values.laborOhBps,
            labor_burden_bps: values.laborBurdenBps,
            contract_oh_bps: values.contractOhBps,
            equipment_oh_bps: values.equipmentOhBps,
            materials_oh_bps: values.materialsOhBps,
            other_oh_bps: values.otherOhBps,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "org_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overhead-settings"] });
    },
  });
}
