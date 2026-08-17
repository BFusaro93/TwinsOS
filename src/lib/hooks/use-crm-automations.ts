"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  CRMAutomation,
  CRMSequence,
  CRMSequenceTrigger,
  CRMTriggerCondition,
  CRMStopCondition,
  CRMSequenceEvent,
  EventType,
  TriggerType,
  ConditionField,
  ConditionOperator,
} from "@/types/crm-automations";

// ── mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAutomation(row: any): CRMAutomation {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description ?? null,
    isActive: row.is_active,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSequence(row: any): CRMSequence {
  return {
    id: row.id,
    orgId: row.org_id,
    automationId: row.automation_id,
    name: row.name,
    description: row.description ?? null,
    restrictEntryTo: row.restrict_entry_to,
    allowReentry: row.allow_reentry,
    reentryAfterMinutes: row.reentry_after_minutes,
    position: row.position,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTrigger(row: any): CRMSequenceTrigger {
  return {
    id: row.id,
    orgId: row.org_id,
    sequenceId: row.sequence_id,
    triggerType: row.trigger_type as TriggerType,
    position: row.position,
    config: (row.config as CRMSequenceTrigger["config"]) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCondition(row: any): CRMTriggerCondition {
  return {
    id: row.id,
    orgId: row.org_id,
    triggerId: row.trigger_id,
    conditionGroup: row.condition_group,
    field: row.field as ConditionField,
    operator: row.operator as ConditionOperator,
    value: row.value ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStopCondition(row: any): CRMStopCondition {
  return {
    id: row.id,
    orgId: row.org_id,
    sequenceId: row.sequence_id,
    field: row.field as ConditionField,
    operator: row.operator as ConditionOperator,
    value: row.value ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(row: any): CRMSequenceEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    sequenceId: row.sequence_id,
    eventType: row.event_type as EventType,
    position: row.position,
    isActive: row.is_active,
    config: row.config ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db() { return createClient() as unknown as any; }

// ── automations ───────────────────────────────────────────────────────────────

export function useAutomations() {
  return useQuery({
    queryKey: ["crm-automations"],
    queryFn: async (): Promise<CRMAutomation[]> => {
      const { data, error } = await db()
        .from("crm_automations")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data.map(mapAutomation)) as CRMAutomation[];
    },
  });
}

export function useAutomation(id: string) {
  return useQuery({
    queryKey: ["crm-automations", id],
    queryFn: async (): Promise<CRMAutomation & { sequences: CRMSequence[] }> => {
      const { data, error } = await db()
        .from("crm_automations")
        .select("*, crm_automation_sequences(*)")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return {
        ...mapAutomation(data),
        sequences: (data.crm_automation_sequences ?? [])
          .filter((s: { deleted_at: string | null }) => !s.deleted_at)
          .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
          .map(mapSequence),
      };
    },
    enabled: !!id,
  });
}

export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string }) => {
      const { data, error } = await db()
        .from("crm_automations")
        .insert({ name: values.name, description: values.description ?? null })
        .select()
        .single();
      if (error) throw error;
      return mapAutomation(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-automations"] });
    },
  });
}

export function useUpdateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<CRMAutomation, "name" | "description" | "isActive">>;
    }) => {
      const { error } = await db()
        .from("crm_automations")
        .update({
          name: updates.name,
          description: updates.description,
          is_active: updates.isActive,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["crm-automations"] });
      qc.invalidateQueries({ queryKey: ["crm-automations", id] });
    },
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db()
        .from("crm_automations")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-automations"] });
    },
  });
}

// ── sequences ─────────────────────────────────────────────────────────────────

export function useSequences(automationId: string) {
  return useQuery({
    queryKey: ["crm-automations", automationId, "sequences"],
    queryFn: async (): Promise<CRMSequence[]> => {
      const { data, error } = await db()
        .from("crm_automation_sequences")
        .select("*")
        .eq("automation_id", automationId)
        .is("deleted_at", null)
        .order("position");
      if (error) throw error;
      return (data.map(mapSequence)) as CRMSequence[];
    },
    enabled: !!automationId,
  });
}

export function useCreateSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      automationId: string;
      name: string;
      description?: string;
      position?: number;
    }) => {
      const { data, error } = await db()
        .from("crm_automation_sequences")
        .insert({
          automation_id: values.automationId,
          name: values.name,
          description: values.description ?? null,
          position: values.position ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return mapSequence(data);
    },
    onSuccess: (_data, { automationId }) => {
      qc.invalidateQueries({ queryKey: ["crm-automations", automationId] });
      qc.invalidateQueries({ queryKey: ["crm-automations", automationId, "sequences"] });
    },
  });
}

export function useUpdateSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      automationId,
      updates,
    }: {
      id: string;
      automationId: string;
      updates: Partial<
        Pick<
          CRMSequence,
          | "name"
          | "description"
          | "isActive"
          | "restrictEntryTo"
          | "allowReentry"
          | "reentryAfterMinutes"
        >
      >;
    }) => {
      const { error } = await db()
        .from("crm_automation_sequences")
        .update({
          name: updates.name,
          description: updates.description,
          is_active: updates.isActive,
          restrict_entry_to: updates.restrictEntryTo,
          allow_reentry: updates.allowReentry,
          reentry_after_minutes: updates.reentryAfterMinutes,
        })
        .eq("id", id);
      if (error) throw error;
      return automationId;
    },
    onSuccess: (_data, { automationId }) => {
      qc.invalidateQueries({ queryKey: ["crm-automations", automationId] });
      qc.invalidateQueries({ queryKey: ["crm-automations", automationId, "sequences"] });
    },
  });
}

export function useDeleteSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, automationId }: { id: string; automationId: string }) => {
      const { error } = await db()
        .from("crm_automation_sequences")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return automationId;
    },
    onSuccess: (_data, { automationId }) => {
      qc.invalidateQueries({ queryKey: ["crm-automations", automationId] });
      qc.invalidateQueries({ queryKey: ["crm-automations", automationId, "sequences"] });
    },
  });
}

// ── events ────────────────────────────────────────────────────────────────────

export function useSequenceEvents(sequenceId: string) {
  return useQuery({
    queryKey: ["crm-sequence-events", sequenceId],
    queryFn: async (): Promise<CRMSequenceEvent[]> => {
      const { data, error } = await db()
        .from("crm_sequence_events")
        .select("*")
        .eq("sequence_id", sequenceId)
        .is("deleted_at", null)
        .order("position");
      if (error) throw error;
      return (data.map(mapEvent)) as CRMSequenceEvent[];
    },
    enabled: !!sequenceId,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      sequenceId: string;
      eventType: EventType;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config?: Record<string, any>;
      position?: number;
    }) => {
      // Always derive the position from the sequence's current last step —
      // every caller previously passed a hardcoded 0 (or a value computed
      // from a stale local list), so every step in a hand-built sequence
      // landed at position 0 and only the first ever ran. Ignore the caller's
      // position entirely rather than trust a value that's easy to get wrong.
      const { data: existing, error: posError } = await db()
        .from("crm_sequence_events")
        .select("position")
        .eq("sequence_id", values.sequenceId)
        .is("deleted_at", null)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (posError) throw posError;
      const nextPosition = (existing?.position ?? -1) + 1;

      const { data, error } = await db()
        .from("crm_sequence_events")
        .insert({
          sequence_id: values.sequenceId,
          event_type: values.eventType,
          config: values.config ?? {},
          position: nextPosition,
        })
        .select()
        .single();
      if (error) throw error;
      return mapEvent(data);
    },
    onSuccess: (_data, { sequenceId }) => {
      qc.invalidateQueries({ queryKey: ["crm-sequence-events", sequenceId] });
    },
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      id: string;
      sequenceId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config?: Record<string, any>;
      isActive?: boolean;
    }) => {
      const { error } = await db()
        .from("crm_sequence_events")
        .update({
          config: values.config,
          is_active: values.isActive,
        })
        .eq("id", values.id);
      if (error) throw error;
    },
    onSuccess: (_data, { sequenceId }) => {
      qc.invalidateQueries({ queryKey: ["crm-sequence-events", sequenceId] });
    },
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, sequenceId }: { id: string; sequenceId: string }) => {
      const { error } = await db()
        .from("crm_sequence_events")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return sequenceId;
    },
    onSuccess: (_data, { sequenceId }) => {
      qc.invalidateQueries({ queryKey: ["crm-sequence-events", sequenceId] });
    },
  });
}

// ── triggers ──────────────────────────────────────────────────────────────────

export function useCreateTrigger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      sequenceId: string;
      triggerType: TriggerType;
      position?: number;
    }) => {
      const { data, error } = await db()
        .from("crm_sequence_triggers")
        .insert({
          sequence_id: values.sequenceId,
          trigger_type: values.triggerType,
          position: values.position ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return mapTrigger(data);
    },
    onSuccess: (_data, { sequenceId }) => {
      qc.invalidateQueries({ queryKey: ["crm-sequence-triggers", sequenceId] });
    },
  });
}

export function useDeleteTrigger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, sequenceId }: { id: string; sequenceId: string }) => {
      const { error } = await db()
        .from("crm_sequence_triggers")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return sequenceId;
    },
    onSuccess: (_data, { sequenceId }) => {
      qc.invalidateQueries({ queryKey: ["crm-sequence-triggers", sequenceId] });
    },
  });
}

// ── trigger conditions ────────────────────────────────────────────────────────

export function useCreateTriggerCondition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      triggerId: string;
      sequenceId: string;
      conditionGroup?: number;
      field: ConditionField;
      operator: ConditionOperator;
      value?: string;
    }) => {
      const { data, error } = await db()
        .from("crm_sequence_trigger_conditions")
        .insert({
          trigger_id: values.triggerId,
          condition_group: values.conditionGroup ?? 0,
          field: values.field,
          operator: values.operator,
          value: values.value ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return mapCondition(data);
    },
    onSuccess: (_data, { sequenceId }) => {
      qc.invalidateQueries({ queryKey: ["crm-sequence-triggers", sequenceId] });
    },
  });
}

export function useDeleteTriggerCondition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, sequenceId }: { id: string; sequenceId: string }) => {
      const { error } = await db()
        .from("crm_sequence_trigger_conditions")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return sequenceId;
    },
    onSuccess: (_data, { sequenceId }) => {
      qc.invalidateQueries({ queryKey: ["crm-sequence-triggers", sequenceId] });
    },
  });
}

// ── stop conditions ───────────────────────────────────────────────────────────

export function useCreateStopCondition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      sequenceId: string;
      field: ConditionField;
      operator: ConditionOperator;
      value?: string;
    }) => {
      const { data, error } = await db()
        .from("crm_sequence_stop_conditions")
        .insert({
          sequence_id: values.sequenceId,
          field: values.field,
          operator: values.operator,
          value: values.value ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return mapStopCondition(data);
    },
    onSuccess: (_data, { sequenceId }) => {
      qc.invalidateQueries({ queryKey: ["crm-sequence-stop-conditions", sequenceId] });
    },
  });
}

export function useDeleteStopCondition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, sequenceId }: { id: string; sequenceId: string }) => {
      const { error } = await db()
        .from("crm_sequence_stop_conditions")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return sequenceId;
    },
    onSuccess: (_data, { sequenceId }) => {
      qc.invalidateQueries({ queryKey: ["crm-sequence-stop-conditions", sequenceId] });
    },
  });
}
