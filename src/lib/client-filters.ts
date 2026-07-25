// Shared client filter-row model — extracted from ClientList.tsx so other
// audiences (Sales Campaigns, and eventually ClientsTable.tsx) can filter
// clients the same way instead of re-implementing the same field/operator
// logic per screen.
import type { Client } from "@/types/crm";

export type FilterOperator = "eq" | "neq" | "contains" | "starts_with" | "lt" | "gt" | "lte" | "gte";
export type FilterFieldType = "text" | "select" | "number" | "date" | "boolean";

export interface FilterFieldDef {
  value: string;
  label: string;
  type: FilterFieldType;
  options?: { v: string; l: string }[];
}

export interface FilterRow {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

export function operatorsFor(type: FilterFieldType): { value: FilterOperator; label: string }[] {
  switch (type) {
    case "text":    return [{ value: "contains", label: "Contains" }, { value: "starts_with", label: "Starts With" }, { value: "eq", label: "= Equal To" }];
    case "select":  return [{ value: "eq", label: "= Equal To" }, { value: "neq", label: "≠ Does Not Equal" }];
    case "number":
    case "date":    return [{ value: "lt", label: "< Less Than" }, { value: "gt", label: "> Greater Than" }, { value: "eq", label: "= Equal To" }, { value: "lte", label: "≤ Less Than Or Equal To" }, { value: "gte", label: "≥ Greater Than Or Equal To" }];
    case "boolean": return [{ value: "eq", label: "= Equal To" }];
  }
}

export function defaultOperator(type: FilterFieldType): FilterOperator {
  switch (type) {
    case "text":  return "contains";
    case "number":
    case "date":  return "lt";
    default:      return "eq";
  }
}

/** Extra per-client data a caller can supply for fields that need more than
 *  the plain Client row — service history and custom field values, both of
 *  which come from separate queries. */
export interface FilterContext {
  /** clientIds with a still-pending (not completed/cancelled/skipped) visit for this service name */
  scheduledServiceClientIds?: (serviceName: string) => Set<string>;
  /** clientIds with a completed visit for this service name */
  completedServiceClientIds?: (serviceName: string) => Set<string>;
  /** custom field value for a client, by field definition id */
  customFieldValue?: (clientId: string, fieldDefId: string) => string | number | null;
}

export function matchesFilterRow(c: Client, row: FilterRow, ctx?: FilterContext): boolean {
  if (!row.value) return true;
  const op = row.operator;
  switch (true) {
    case row.field === "status":
      if (op === "eq" && c.status !== row.value) return false;
      if (op === "neq" && c.status === row.value) return false;
      return true;
    case row.field === "account_type":
      if (op === "eq" && c.accountType !== row.value) return false;
      if (op === "neq" && c.accountType === row.value) return false;
      return true;
    case row.field === "balance": {
      const bal = (c.balanceOutstandingCents ?? 0) / 100;
      const val = parseFloat(row.value);
      if (isNaN(val)) return true;
      if (op === "eq"  && bal !== val) return false;
      if (op === "lt"  && bal >= val)  return false;
      if (op === "gt"  && bal <= val)  return false;
      if (op === "lte" && bal > val)   return false;
      if (op === "gte" && bal < val)   return false;
      return true;
    }
    case row.field === "city": {
      const city = (c.billingCity ?? "").toLowerCase();
      const val = row.value.toLowerCase();
      if (op === "contains"    && !city.includes(val))   return false;
      if (op === "starts_with" && !city.startsWith(val)) return false;
      if (op === "eq"          && city !== val)          return false;
      return true;
    }
    case row.field === "service_city": {
      const city = (c.serviceCity ?? "").toLowerCase();
      const val = row.value.toLowerCase();
      if (op === "contains"    && !city.includes(val))   return false;
      if (op === "starts_with" && !city.startsWith(val)) return false;
      if (op === "eq"          && city !== val)          return false;
      return true;
    }
    case row.field === "zip": {
      const zip = c.billingZip ?? c.serviceZip ?? "";
      if (op === "eq"       && zip !== row.value)          return false;
      if (op === "contains" && !zip.includes(row.value))   return false;
      return true;
    }
    case row.field === "source":
      if (op === "eq"  && c.source !== row.value) return false;
      if (op === "neq" && c.source === row.value) return false;
      return true;
    case row.field === "sales_rep":
      if (op === "eq"  && c.salesRepId !== row.value) return false;
      if (op === "neq" && c.salesRepId === row.value) return false;
      return true;
    case row.field === "priority": {
      const pri = c.priority ?? "normal";
      if (op === "eq"  && pri !== row.value) return false;
      if (op === "neq" && pri === row.value) return false;
      return true;
    }
    case row.field === "client_since": {
      if (!c.clientSince) return false;
      const cDate = c.clientSince.slice(0, 10);
      const val   = row.value;
      if (op === "eq"  && cDate !== val) return false;
      if (op === "lt"  && cDate >= val)  return false;
      if (op === "gt"  && cDate <= val)  return false;
      if (op === "lte" && cDate > val)   return false;
      if (op === "gte" && cDate < val)   return false;
      return true;
    }
    case row.field === "tags":
      if (op === "eq"  && !(c.tags ?? []).includes(row.value)) return false;
      if (op === "neq" && (c.tags ?? []).includes(row.value))  return false;
      return true;
    case row.field === "scheduled_service":
      return ctx?.scheduledServiceClientIds?.(row.value).has(c.id) ?? true;
    case row.field === "completed_service":
      return ctx?.completedServiceClientIds?.(row.value).has(c.id) ?? true;
    case row.field === "referred_by":
      if (op === "eq" && row.value === "yes" && !c.referredBy)  return false;
      if (op === "eq" && row.value === "no"  && !!c.referredBy) return false;
      return true;
    case row.field === "do_not_market":
      if (op === "eq" && row.value === "yes" && !c.doNotMarket) return false;
      if (op === "eq" && row.value === "no"  && c.doNotMarket)  return false;
      return true;
    case row.field === "taxable":
      if (op === "eq" && row.value === "yes" && !c.isTaxable) return false;
      if (op === "eq" && row.value === "no"  && c.isTaxable)  return false;
      return true;
    case row.field === "ok_to_email":
      if (op === "eq" && row.value === "yes" && !c.okToEmail) return false;
      if (op === "eq" && row.value === "no"  && c.okToEmail)  return false;
      return true;
    case row.field.startsWith("custom:"): {
      const fieldDefId = row.field.slice("custom:".length);
      const v = ctx?.customFieldValue?.(c.id, fieldDefId);
      if (v == null) return false;
      const sv = String(v).toLowerCase();
      const val = row.value.toLowerCase();
      if (op === "contains"    && !sv.includes(val))   return false;
      if (op === "starts_with" && !sv.startsWith(val)) return false;
      if (op === "eq"          && sv !== val)          return false;
      if (typeof v === "number") {
        const num = parseFloat(row.value);
        if (!isNaN(num)) {
          if (op === "lt"  && v >= num) return false;
          if (op === "gt"  && v <= num) return false;
          if (op === "lte" && v > num)  return false;
          if (op === "gte" && v < num)  return false;
        }
      }
      return true;
    }
    default:
      return true;
  }
}

export function matchesAllFilterRows(c: Client, rows: FilterRow[], ctx?: FilterContext): boolean {
  return rows.every((row) => matchesFilterRow(c, row, ctx));
}
