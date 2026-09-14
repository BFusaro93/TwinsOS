"use client";

import { useQuery } from "@tanstack/react-query";
import type { CompanyReportData } from "@/types/company-report";

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function useCompanyReport() {
  return useQuery<CompanyReportData>({
    queryKey: ["company-report"],
    queryFn: async () => {
      const res = await fetch("/api/crm/company-report");
      if (!res.ok) throw new Error(await readError(res));
      return (await res.json()) as CompanyReportData;
    },
    staleTime: 60 * 1000,
  });
}
