"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
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
    parentEventId: row.parent_event_id ?? null,
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

/**
 * Enrollment only checks is_active (never deleted_at) on the automation and
 * sequence, and in-flight enrollments keep processing their remaining steps —
 * so a bare soft-delete left a "deleted" automation still enrolling clients
 * and sending. Deleting therefore also deactivates and stops what's pending.
 */
async function stopPendingEnrollments(sequenceIds: string[]) {
  if (sequenceIds.length === 0) return;
  const nowIso = new Date().toISOString();
  const { error } = await db()
    .from("crm_sequence_enrollments")
    .update({ stopped_at: nowIso, updated_at: nowIso })
    .in("sequence_id", sequenceIds)
    .is("completed_at", null)
    .is("stopped_at", null);
  if (error) throw error;
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const nowIso = new Date().toISOString();
      const { error } = await db()
        .from("crm_automations")
        .update({ deleted_at: nowIso, is_active: false })
        .eq("id", id);
      if (error) throw error;
      const { data: sequences, error: seqError } = await db()
        .from("crm_automation_sequences")
        .select("id")
        .eq("automation_id", id);
      if (seqError) throw seqError;
      await stopPendingEnrollments((sequences ?? []).map((s: { id: string }) => s.id));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-automations"] });
    },
  });
}

/**
 * Duplicates an automation — its sequences (entry/re-entry settings), steps
 * (including IF-branch nesting and per-step active flag), start triggers with
 * their conditions, and stop conditions — as "<name> (Copy)". The copy is
 * created DISABLED so nothing starts enrolling or sending until the user
 * reviews and turns it on. org_id comes from column defaults (my_org_id()) like
 * every other create here. If any step fails, the half-built copy is
 * soft-deleted again so no partial automation is left behind.
 */
export function useCopyAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sourceId: string): Promise<CRMAutomation> => {
      const supabase = db();
      const { data: src, error: srcErr } = await supabase
        .from("crm_automations").select("*").eq("id", sourceId).is("deleted_at", null).single();
      if (srcErr) throw srcErr;
      const { data: seqRows, error: seqErr } = await supabase
        .from("crm_automation_sequences").select("*").eq("automation_id", sourceId).is("deleted_at", null).order("position");
      if (seqErr) throw seqErr;

      const { data: created, error: createErr } = await supabase
        .from("crm_automations")
        .insert({ name: `${src.name} (Copy)`, description: src.description ?? null, is_active: false })
        .select()
        .single();
      if (createErr) throw createErr;
      const copy = mapAutomation(created);

      try {
        for (const seq of (seqRows ?? []) as Record<string, unknown>[]) {
          const seqId = seq.id as string;
          const { data: newSeq, error: newSeqErr } = await supabase
            .from("crm_automation_sequences")
            .insert({
              automation_id: copy.id,
              name: seq.name,
              description: seq.description ?? null,
              position: seq.position ?? 0,
              restrict_entry_to: seq.restrict_entry_to,
              allow_reentry: seq.allow_reentry,
              reentry_after_minutes: seq.reentry_after_minutes,
              is_active: seq.is_active,
            })
            .select("id")
            .single();
          if (newSeqErr) throw newSeqErr;

          // Triggers + their gating conditions.
          const { data: trigRows, error: trigErr } = await supabase
            .from("crm_sequence_triggers").select("id, trigger_type, position, config").eq("sequence_id", seqId).order("position");
          if (trigErr) throw trigErr;
          for (const t of (trigRows ?? []) as { id: string; trigger_type: string; position: number; config: unknown }[]) {
            const { data: newTrig, error: newTrigErr } = await supabase
              .from("crm_sequence_triggers")
              .insert({ sequence_id: newSeq.id, trigger_type: t.trigger_type, position: t.position, config: t.config ?? {} })
              .select("id")
              .single();
            if (newTrigErr) throw newTrigErr;
            const { data: condRows, error: condErr } = await supabase
              .from("crm_sequence_trigger_conditions").select("condition_group, field, operator, value").eq("trigger_id", t.id);
            if (condErr) throw condErr;
            if ((condRows ?? []).length > 0) {
              const { error: insCondErr } = await supabase.from("crm_sequence_trigger_conditions").insert(
                (condRows as { condition_group: number; field: string; operator: string; value: string | null }[]).map((c) => ({
                  trigger_id: newTrig.id, condition_group: c.condition_group, field: c.field, operator: c.operator, value: c.value,
                }))
              );
              if (insCondErr) throw insCondErr;
            }
          }

          // Stop conditions.
          const { data: stopRows, error: stopErr } = await supabase
            .from("crm_sequence_stop_conditions").select("field, operator, value").eq("sequence_id", seqId);
          if (stopErr) throw stopErr;
          if ((stopRows ?? []).length > 0) {
            const { error: insStopErr } = await supabase.from("crm_sequence_stop_conditions").insert(
              (stopRows as { field: string; operator: string; value: string | null }[]).map((c) => ({
                sequence_id: newSeq.id, field: c.field, operator: c.operator, value: c.value,
              }))
            );
            if (insStopErr) throw insStopErr;
          }

          // Steps, in position order through the same RPC every other step
          // creation uses (which assigns positions server-side). Parents always
          // precede their children, so the old->new id map is filled in time.
          const { data: eventRows, error: evErr } = await supabase
            .from("crm_sequence_events")
            .select("id, event_type, config, parent_event_id, is_active")
            .eq("sequence_id", seqId)
            .is("deleted_at", null)
            .order("position");
          if (evErr) throw evErr;
          const idMap = new Map<string, string>();
          for (const e of (eventRows ?? []) as { id: string; event_type: string; config: unknown; parent_event_id: string | null; is_active: boolean }[]) {
            const { data: newEv, error: newEvErr } = await supabase.rpc("crm_insert_sequence_event", {
              p_sequence_id: newSeq.id,
              p_event_type: e.event_type,
              p_config: e.config ?? {},
              p_parent_event_id: e.parent_event_id ? idMap.get(e.parent_event_id) ?? null : null,
            });
            if (newEvErr) throw newEvErr;
            idMap.set(e.id, (newEv as { id: string }).id);
            if (e.is_active === false) {
              const { error: offErr } = await supabase.from("crm_sequence_events").update({ is_active: false }).eq("id", (newEv as { id: string }).id);
              if (offErr) throw offErr;
            }
          }
        }
      } catch (err) {
        // Don't leave a half-built copy behind.
        await supabase.from("crm_automations").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", copy.id);
        throw err;
      }
      return copy;
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
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq("id", id);
      if (error) throw error;
      await stopPendingEnrollments([id]);
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
      /** IF Branch step to nest the new step inside; omit to append at the top level. */
      parentEventId?: string | null;
    }) => {
      // Position is always derived server-side: appended to the end of the
      // sequence, or to the end of the parent IF's block (shifting later steps
      // and in-flight enrollments so none of them points at the wrong step).
      const { data, error } = await db().rpc("crm_insert_sequence_event", {
        p_sequence_id: values.sequenceId,
        p_event_type: values.eventType,
        p_config: values.config ?? {},
        p_parent_event_id: values.parentEventId ?? null,
      });
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
      // Deleting an IF Branch takes its whole block with it — leaving the
      // inner steps behind would silently turn guarded steps into unguarded ones.
      const { data: rows, error: readError } = await db()
        .from("crm_sequence_events")
        .select("id, parent_event_id")
        .eq("sequence_id", sequenceId)
        .is("deleted_at", null);
      if (readError) throw readError;
      const children = new Map<string, string[]>();
      for (const r of rows as { id: string; parent_event_id: string | null }[]) {
        if (!r.parent_event_id) continue;
        children.set(r.parent_event_id, [...(children.get(r.parent_event_id) ?? []), r.id]);
      }
      const ids = [id];
      for (let i = 0; i < ids.length; i++) ids.push(...(children.get(ids[i]) ?? []));

      const { error } = await db()
        .from("crm_sequence_events")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
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
