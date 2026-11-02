"use client";

import { useMemo } from "react";
import { useClientFilterOptions, useOrgTags } from "@/lib/hooks/use-clients";
import type { FilterFieldDef } from "@/lib/client-filters";

/** Filter fields for the Leads table — a trimmed version of
 *  useClientFilterFields() with only what's meaningful pre-conversion
 *  (no balance, sales rep, or service-history fields — leads have none yet). */
export function useLeadFilterFields() {
  // Sources in use across the org (leads and clients) — fetched as a short
  // list rather than derived from every lead.
  const { data: filterOptions } = useClientFilterOptions();
  const orgTags = useOrgTags();
  const uniqueSources = filterOptions?.sources;

  const fields: FilterFieldDef[] = useMemo(() => [
    { value: "account_type", label: "Account Type", type: "select",
      options: [{ v: "residential", l: "Residential" }, { v: "commercial", l: "Commercial" }] },
    { value: "source",       label: "Source",       type: "select",
      options: (uniqueSources ?? []).map((s) => ({ v: s, l: s })) },
    { value: "city",         label: "Billing City", type: "text" },
    { value: "service_city", label: "Service City", type: "text" },
    { value: "zip",          label: "Zip Code",     type: "text" },
    { value: "tags",         label: "Tags",         type: "select",
      options: orgTags.map((t) => ({ v: t, l: t })) },
    // Not client_since: that stays empty until a lead converts.
    { value: "date_added",   label: "Date Added",   type: "date" },
  ], [uniqueSources, orgTags]);

  return { fields };
}
