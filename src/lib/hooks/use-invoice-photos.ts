"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import type { InvoicePhotosResponse } from "@/types/invoice-photos";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function useInvoicePhotos(invoiceId: string, opts: { candidates: boolean; search?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: ["invoice-photos", invoiceId, opts.candidates, opts.search ?? ""],
    queryFn: async (): Promise<InvoicePhotosResponse> => {
      const qs = new URLSearchParams();
      if (opts.candidates) qs.set("candidates", "1");
      if (opts.search) qs.set("search", opts.search);
      const res = await fetch(`/api/crm/invoices/${invoiceId}/photos?${qs.toString()}`);
      if (!res.ok) throw new Error(await readError(res, "Failed to load photos"));
      return (await res.json()) as InvoicePhotosResponse;
    },
    enabled: !!invoiceId && (opts.enabled ?? true),
  });
}

function useInvalidate(invoiceId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["invoice-photos", invoiceId] });
}

export function useAttachInvoicePhotos(invoiceId: string) {
  const invalidate = useInvalidate(invoiceId);
  return useMutation({
    mutationFn: async (photos: { source: "job_photo" | "visit_photo"; sourceId: string }[]) => {
      const res = await fetch(`/api/crm/invoices/${invoiceId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to attach photos"));
    },
    onSettled: invalidate,
  });
}

export function useUploadInvoicePhotos(invoiceId: string) {
  const invalidate = useInvalidate(invoiceId);
  return useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      for (const f of files) form.append("file", f);
      const res = await fetch(`/api/crm/invoices/${invoiceId}/photos`, { method: "POST", body: form });
      if (!res.ok) throw new Error(await readError(res, "Failed to upload photos"));
    },
    onSettled: invalidate,
  });
}

export function useUpdateInvoicePhotoCaption(invoiceId: string) {
  const invalidate = useInvalidate(invoiceId);
  return useMutation({
    mutationFn: async ({ id, caption }: { id: string; caption: string }) => {
      const res = await fetch(`/api/crm/invoices/${invoiceId}/photos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [{ id, caption }] }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to update caption"));
    },
    onSettled: invalidate,
  });
}

export function useRemoveInvoicePhotos(invoiceId: string) {
  const invalidate = useInvalidate(invoiceId);
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(`/api/crm/invoices/${invoiceId}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to remove photo"));
    },
    onSettled: invalidate,
  });
}
