"use client";

import { useMemo } from "react";
import { useClientFilterOptions, useOrgTags } from "@/lib/hooks/use-clients";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { useCustomFieldDefs } from "@/lib/hooks/use-client-custom-fields";
import { usePermissions } from "@/lib/hooks/use-permissions";
import type { FilterFieldDef } from "@/lib/client-filters";

/** Builds the full client filter field list (status, city, zip, tags, custom
 *  fields, service history, ...) — shared by anything that filters the client
 *  list (Clients page list + table, Sales Campaigns audience picker, ...) so
 *  they stay in sync automatically. The rows are evaluated server-side by
 *  crm_search_clients() (see useClientsPage / useClientSearch). */
export function useClientFilterFields() {
  const { data: filterOptions } = useClientFilterOptions();
  const orgTags = useOrgTags();
  const { data: crmServices = [] } = useCRMServices();
  const { data: customFieldDefs = [] } = useCustomFieldDefs();
  // Filtering by balance reveals balances, so it follows View Client Balance.
  const { can } = usePermissions();
  const canViewBalance = can("client_view_balance");

  const uniqueSources = filterOptions?.sources;
  const uniqueSalesReps = filterOptions?.salesReps;
  const serviceNames = useMemo(() =>
    Array.from(new Set(crmServices.map((s: { name?: string }) => s.name).filter((n): n is string => !!n))),
    [crmServices]
  );

  const fields: FilterFieldDef[] = useMemo(() => [
    { value: "status",         label: "Status",            type: "select",
      options: [{ v: "active", l: "Active" }, { v: "lead", l: "Lead" }, { v: "inactive", l: "Inactive" }, { v: "cancelled", l: "Cancelled" }, { v: "lost", l: "Lost" }] },
    { value: "account_type",   label: "Account Type",      type: "select",
      options: [{ v: "residential", l: "Residential" }, { v: "commercial", l: "Commercial" }] },
    ...(canViewBalance ? [{ value: "balance", label: "Balance", type: "number" as const }] : []),
    { value: "city",           label: "Billing City",      type: "text" },
    { value: "service_city",   label: "Service City",      type: "text" },
    { value: "zip",            label: "Zip Code",          type: "text" },
    { value: "source",         label: "Client Source",     type: "select",
      options: (uniqueSources ?? []).map((s) => ({ v: s, l: s })) },
    { value: "sales_rep",      label: "Sales Rep",         type: "select",
      options: (uniqueSalesReps ?? []).map((r) => ({ v: r.id, l: r.name })) },
    { value: "priority",       label: "Priority",          type: "select",
      options: [{ v: "low", l: "Low" }, { v: "normal", l: "Normal" }, { v: "high", l: "High" }] },
    { value: "client_since",   label: "Client Since Date", type: "date" },
    { value: "tags",           label: "Tags",              type: "select",
      options: orgTags.map((t) => ({ v: t, l: t })) },
    { value: "scheduled_service", label: "Has Scheduled Job For", type: "select",
      options: serviceNames.map((n) => ({ v: n, l: n })) },
    { value: "completed_service", label: "Has Completed Job For", type: "select",
      options: serviceNames.map((n) => ({ v: n, l: n })) },
    ...customFieldDefs.map((d) => ({
      value: `custom:${d.id}`,
      label: d.name,
      type: (d.fieldType === "number" ? "number" : "text") as "number" | "text",
    })),
    { value: "referred_by",    label: "Referred By",       type: "boolean" },
    { value: "do_not_market",  label: "Do Not Market",     type: "boolean" },
    { value: "taxable",        label: "Taxable",           type: "boolean" },
    { value: "ok_to_email",    label: "OK to Email",       type: "boolean" },
  ], [uniqueSources, uniqueSalesReps, orgTags, serviceNames, customFieldDefs, canViewBalance]);

  return { fields };
}
