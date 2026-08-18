"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CRMEmailTemplate } from "@/types/crm-proposals";

function mapTemplate(row: Record<string, unknown>): CRMEmailTemplate {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    name: row.name as string,
    subject: row.subject as string,
    bodyHtml: row.body_html as string,
    templateType: (row.template_type as CRMEmailTemplate["templateType"]) ?? "estimate",
    isDefault: (row.is_default as boolean) ?? false,
    includePdf: (row.include_pdf as boolean) ?? true,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function useEmailTemplates(templateType?: CRMEmailTemplate["templateType"]) {
  return useQuery({
    queryKey: ["email-templates", templateType ?? "all"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_email_templates")
        .select("*")
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("name");
      if (templateType) q = q.eq("template_type", templateType);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Record<string, unknown>[]).map(mapTemplate);
    },
  });
}

export function useUpsertEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CRMEmailTemplate> & { id?: string }) => {
      const supabase = createClient();
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined)         patch.name          = input.name;
      if (input.subject !== undefined)      patch.subject       = input.subject;
      if (input.bodyHtml !== undefined)     patch.body_html     = input.bodyHtml;
      if (input.templateType !== undefined) patch.template_type = input.templateType;
      if (input.isDefault !== undefined)    patch.is_default    = input.isDefault;
      if (input.includePdf !== undefined)   patch.include_pdf   = input.includePdf;
      patch.updated_at = new Date().toISOString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_email_templates")
        .upsert(input.id ? { id: input.id, ...patch } : patch)
        .select()
        .single();
      if (error) throw error;
      return mapTemplate(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-templates"] }),
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_email_templates")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-templates"] }),
  });
}
