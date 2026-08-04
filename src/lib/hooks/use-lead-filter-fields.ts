"use client";

import { useMemo } from "react";
import { useLeads } from "@/lib/hooks/use-clients";
import { useOrgTags } from "@/lib/hooks/use-clients";
import type { FilterFieldDef } from "@/lib/client-filters";

/** Filter fields for the Leads table — a trimmed version of
 *  useClientFilterFields() with only what's meaningful pre-conversion
 *  (no balance, sales rep, or service-history fields — leads have none yet). */
export function useLeadFilterFields() {
  const { data: leads } = useLeads();
  const orgTags = useOrgTags();

  const uniqueSources = useMemo(() =>
    Array.from(new Set((leads ?? []).map((l) => l.source).filter(Boolean) as string[])).sort(),
    [leads]
  );

  const fields: FilterFieldDef[] = useMemo(() => [
    { value: "account_type", label: "Account Type", type: "select",
      options: [{ v: "residential", l: "Residential" }, { v: "commercial", l: "Commercial" }] },
    { value: "source",       label: "Source",       type: "select",
      options: uniqueSources.map((s) => ({ v: s, l: s })) },
    { value: "city",         label: "City",         type: "text" },
    { value: "service_city", label: "Service City", type: "text" },
    { value: "zip",          label: "Zip Code",     type: "text" },
    { value: "tags",         label: "Tags",         type: "select",
      options: orgTags.map((t) => ({ v: t, l: t })) },
    { value: "client_since", label: "Date Added",   type: "date" },
  ], [uniqueSources, orgTags]);

  return { fields };
}
