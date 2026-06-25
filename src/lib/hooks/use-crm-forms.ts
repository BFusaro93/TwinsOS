"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CRMForm, CRMFormField, CRMFormResponse, CRMFormRule, NewFormValues } from "@/types/crm-forms";

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
    mutationFn: async (fields: Array<Omit<CRMFormField, "id" | "formId">>) => {
      const res = await fetch(`/api/crm/forms/${formId}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) throw new Error("Failed to save fields");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-form", formId] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-form-rules", formId] }),
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
