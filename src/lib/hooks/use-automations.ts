import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/types/supabase";
import type {
  AutomationRule,
  AutomationTrigger,
  AutomationAction,
  TriggerType,
  ActionType,
} from "@/types/automation";

type AutomationRow = Database["public"]["Tables"]["automations"]["Row"];

// ── Mapper ────────────────────────────────────────────────────────────────────

export function mapAutomation(row: AutomationRow): AutomationRule {
  const tc = (row.trigger_config ?? {}) as Record<string, unknown>;
  const ac = (row.action_config ?? {}) as Record<string, unknown>;

  let trigger: AutomationTrigger;
  switch (row.trigger_type as TriggerType) {
    case "meter_threshold":
      trigger = {
        type: "meter_threshold",
        meterId: (tc.meter_id as string) ?? "",
        meterLabel: (tc.meter_label as string) ?? "",
        operator: ((tc.operator as string) ?? ">=") as ">=" | "<=",
        value: Number(tc.threshold ?? 0),
        interval: tc.interval != null ? Number(tc.interval) : null,
      };
      break;
    case "part_low_stock":
      trigger = {
        type: "part_low_stock",
        partName: (tc.part_name as string) ?? "any",
      };
      break;
    case "pm_due":
      trigger = {
        type: "pm_due",
        daysAhead: Number(tc.days_ahead ?? 7),
      };
      break;
    case "wo_overdue":
      trigger = {
        type: "wo_overdue",
        daysOverdue: Number(tc.days_overdue ?? 1),
      };
      break;
    case "request_submitted":
      trigger = { type: "request_submitted" };
      break;
    case "wo_status_change":
      trigger = {
        type: "wo_status_change",
        toStatus: (tc.to_status as AutomationTrigger & { type: "wo_status_change" })["toStatus"] ??
          (tc.toStatus as "open" | "in_progress" | "on_hold" | "done") ?? "open",
      };
      break;
    case "po_status_change":
      trigger = {
        type: "po_status_change",
        toStatus: (tc.to_status as AutomationTrigger & { type: "po_status_change" })["toStatus"] ??
          (tc.toStatus as "draft" | "pending_approval" | "approved" | "rejected" | "ordered" | "closed") ?? "approved",
      };
      break;
    default:
      trigger = { type: "request_submitted" };
  }

  let action: AutomationAction;
  switch (row.action_type as ActionType) {
    case "create_work_order":
      action = {
        type: "create_work_order",
        title: (ac.title as string) ?? "",
        priority: ((ac.priority as string) ?? "medium") as "low" | "medium" | "high" | "urgent",
        assignedTo: (ac.assigned_to as string) ?? "",
      };
      break;
    case "create_wo_request":
      action = {
        type: "create_wo_request",
        title: (ac.title as string) ?? "",
        priority: ((ac.priority as string) ?? "medium") as "low" | "medium" | "high" | "urgent",
        assignedTo: (ac.assigned_to as string) ?? "",
      };
      break;
    case "create_requisition":
      action = {
        type: "create_requisition",
        notes: (ac.notes as string) ?? "",
      };
      break;
    case "send_notification":
      action = {
        type: "send_notification",
        recipientRole: ((ac.recipient_role as string) ?? "manager") as
          "admin" | "manager" | "technician" | "purchaser" | "all",
        message: (ac.message as string) ?? "",
      };
      break;
    case "send_email":
      action = {
        type: "send_email",
        recipient: (ac.recipient as string) ?? "",
      };
      break;
    default:
      action = { type: "send_notification", recipientRole: "manager", message: "" };
  }

  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    isEnabled: row.enabled,
    trigger,
    action,
    lastFiredAt: row.last_fired_at,
    lastFiredValue: row.last_fired_value,
    pendingReset: row.pending_reset,
  };
}

// ── Trigger config serialiser ─────────────────────────────────────────────────

function serialiseTriggerConfig(trigger: AutomationTrigger): Json {
  switch (trigger.type) {
    case "meter_threshold":
      return {
        meter_id: trigger.meterId,
        meter_label: trigger.meterLabel,
        operator: trigger.operator,
        threshold: trigger.value,
        interval: trigger.interval ?? null,
      };
    case "part_low_stock":
      return { part_name: trigger.partName };
    case "pm_due":
      return { days_ahead: trigger.daysAhead };
    case "wo_overdue":
      return { days_overdue: trigger.daysOverdue };
    case "request_submitted":
      return {};
    case "wo_status_change":
      return { to_status: trigger.toStatus };
    case "po_status_change":
      return { to_status: trigger.toStatus };
  }
}

function serialiseActionConfig(action: AutomationAction): Json {
  switch (action.type) {
    case "create_work_order":
      return {
        title: action.title,
        priority: action.priority,
        assigned_to: action.assignedTo,
      };
    case "create_wo_request":
      return {
        title: action.title,
        priority: action.priority,
        assigned_to: action.assignedTo,
      };
    case "create_requisition":
      return { notes: action.notes };
    case "send_notification":
      return { recipient_role: action.recipientRole, message: action.message };
    case "send_email":
      return { recipient: action.recipient };
  }
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useAutomations() {
  return useQuery<AutomationRule[]>({
    queryKey: ["automations"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.map(mapAutomation);
    },
  });
}

export function useCreateAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rule: {
      name: string;
      enabled: boolean;
      trigger: AutomationTrigger;
      action: AutomationAction;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");
      const { data, error } = await supabase
        .from("automations")
        .insert({
          org_id: profile.org_id,
          name: rule.name,
          enabled: rule.enabled,
          trigger_type: rule.trigger.type,
          trigger_config: serialiseTriggerConfig(rule.trigger),
          action_type: rule.action.type,
          action_config: serialiseActionConfig(rule.action),
        })
        .select()
        .single();
      if (error) throw error;
      return mapAutomation(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });
}

export function useUpdateAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      name?: string;
      enabled?: boolean;
      trigger?: AutomationTrigger;
      action?: AutomationAction;
    }) => {
      const supabase = createClient();
      const patch: Record<string, unknown> = {};
      if (updates.name !== undefined) patch.name = updates.name;
      if (updates.enabled !== undefined) patch.enabled = updates.enabled;
      if (updates.trigger !== undefined) {
        patch.trigger_type = updates.trigger.type;
        patch.trigger_config = serialiseTriggerConfig(updates.trigger);
      }
      if (updates.action !== undefined) {
        patch.action_type = updates.action.type;
        patch.action_config = serialiseActionConfig(updates.action);
      }
      const { data, error } = await supabase
        .from("automations")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapAutomation(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });
}

export function useDeleteAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("automations")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });
}
