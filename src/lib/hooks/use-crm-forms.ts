"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import type { CRMForm, CRMFormField, CRMFormResponse, CRMFormRule, FormResponseStatus, NewFormValues } from "@/types/crm-forms";

// ── Forms list ────────────────────────────────────────────────────────────────

export function useForms() {
  return useQuery<CRMForm[]>({
    queryKey: ["crm-forms"],
    queryFn: async () => {
      const res = await fetch("/api/crm/forms");
      if (!res.ok) throw new Error("Failed to fetch forms");
      return res.json();
    },
  });
}

// ── Single form ───────────────────────────────────────────────────────────────

export function useForm(id: string) {
  return useQuery<CRMForm & { fields: CRMFormField[] }>({
    queryKey: ["crm-form", id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/forms/${id}`);
      if (!res.ok) throw new Error("Failed to fetch form");
      return res.json();
    },
    enabled: !!id,
  });
}

// ── Form responses ────────────────────────────────────────────────────────────

export function useFormResponses(formId?: string) {
  return useQuery<CRMFormResponse[]>({
    queryKey: ["crm-form-responses", formId],
    queryFn: async () => {
      const url = formId
        ? `/api/crm/forms/responses?formId=${formId}`
        : `/api/crm/forms/responses`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch responses");
      return res.json();
    },
  });
}

type ResponsePatch =
  | { id: string; isRead: boolean }
  | { id: string; status: FormResponseStatus }
  | { id: string; delete: true };

/** Shared PATCH + optimistic update for every response mutation. Optimistic
 *  edits are applied to every cached ["crm-form-responses", …] list and rolled
 *  back on error. */
function useResponseMutation() {
  const qc = useQueryClient();
  const KEY = ["crm-form-responses"];
  return useMutation({
    mutationFn: async (patch: ResponsePatch) => {
      const res = await fetch("/api/crm/forms/responses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to update response");
      }
      return res.json();
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueriesData<CRMFormResponse[]>({ queryKey: KEY });
      qc.setQueriesData<CRMFormResponse[]>({ queryKey: KEY }, (old) => {
        if (!old) return old;
        if ("delete" in patch) return old.filter((r) => r.id !== patch.id);
        return old.map((r) =>
          r.id !== patch.id ? r : "isRead" in patch ? { ...r, isRead: patch.isRead } : { ...r, status: patch.status }
        );
      });
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      ctx?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      // Responses count on the forms list/detail header
      void qc.invalidateQueries({ queryKey: ["crm-forms"] });
    },
  });
}

export function useMarkFormResponseRead() {
  const m = useResponseMutation();
  return {
    ...m,
    mutate: (vars: { id: string; isRead: boolean }, opts?: Parameters<typeof m.mutate>[1]) => m.mutate(vars, opts),
  };
}

export function useUpdateFormResponseStatus() {
  const m = useResponseMutation();
  return {
    ...m,
    mutate: (vars: { id: string; status: FormResponseStatus }, opts?: Parameters<typeof m.mutate>[1]) => m.mutate(vars, opts),
  };
}

export function useDeleteFormResponse() {
  const m = useResponseMutation();
  return {
    ...m,
    mutate: (vars: { id: string }, opts?: Parameters<typeof m.mutate>[1]) => m.mutate({ id: vars.id, delete: true }, opts),
  };
}

// ── Create form ───────────────────────────────────────────────────────────────

export function useCreateForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: NewFormValues) => {
      const res = await fetch("/api/crm/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Failed to create form");
      return res.json() as Promise<CRMForm>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-forms"] }),
  });
}

// ── Update form ───────────────────────────────────────────────────────────────

export function useUpdateForm(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<CRMForm>) => {
      const res = await fetch(`/api/crm/forms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Failed to update form");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-forms"] });
      qc.invalidateQueries({ queryKey: ["crm-form", id] });
    },
  });
}

// ── Save fields ───────────────────────────────────────────────────────────────

export function useSaveFormFields(formId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields: Array<Omit<CRMFormField, "id" | "formId"> & { id?: string }>) => {
      const res = await fetch(`/api/crm/forms/${formId}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) {
        // Surface the server's validation message (e.g. duplicate labels).
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to save fields");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-form", formId] });
      // The route soft-deletes rules that pointed at removed fields and bumps
      // the form's updated_at, so both of those caches go stale too.
      qc.invalidateQueries({ queryKey: ["crm-form-rules", formId] });
      qc.invalidateQueries({ queryKey: ["crm-forms"] });
    },
  });
}

// ── Form rules ────────────────────────────────────────────────────────────────

export function useFormRules(formId: string) {
  return useQuery<CRMFormRule[]>({
    queryKey: ["crm-form-rules", formId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/forms/${formId}/rules`);
      if (!res.ok) throw new Error("Failed to fetch rules");
      return res.json();
    },
    enabled: !!formId,
  });
}

export function useSaveFormRules(formId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rules: Array<Omit<CRMFormRule, "id" | "formId" | "createdAt">>) => {
      const res = await fetch(`/api/crm/forms/${formId}/rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      if (!res.ok) throw new Error("Failed to save rules");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-form-rules", formId] });
      // Rule edits bump the form's updated_at (Forms list "Date Modified").
      qc.invalidateQueries({ queryKey: ["crm-forms"] });
    },
  });
}

// ── Delete form ───────────────────────────────────────────────────────────────

export function useDeleteForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/crm/forms/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete form");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-forms"] }),
  });
}

// ── Copy form ─────────────────────────────────────────────────────────────────

export function useCopyForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/crm/forms/${id}/copy`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to copy form");
      }
      return res.json() as Promise<{ id: string; name: string }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-forms"] }),
  });
}
