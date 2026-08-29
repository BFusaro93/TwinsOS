/**
 * Shared catalog of public API scopes, in "resource:tier" form (e.g.
 * "clients:read", "requisitions:write:safe"). Used by the API key
 * management UI to build the scope picker, and will be the same catalog
 * Phase 3's resource endpoints check against and Phase 4's OpenAPI
 * generation annotates with x-agent-tier. Tier assignments here are
 * provisional — they'll be revisited as each resource's endpoints land.
 */

export type ApiScopeTier = "read" | "write:safe" | "write:sensitive";

export interface ApiScopeResource {
  key: string;
  label: string;
  tiers: ApiScopeTier[];
}

export const API_SCOPE_RESOURCES: ApiScopeResource[] = [
  { key: "clients", label: "Clients", tiers: ["read", "write:safe"] },
  { key: "estimates", label: "Estimates", tiers: ["read", "write:safe"] },
  { key: "jobs", label: "Jobs", tiers: ["read", "write:safe"] },
  { key: "invoices", label: "Invoices", tiers: ["read"] },
  { key: "contracts", label: "Contracts", tiers: ["read"] },
  { key: "assets", label: "Assets", tiers: ["read", "write:safe"] },
  { key: "work_orders", label: "Work Orders", tiers: ["read", "write:safe"] },
  { key: "pm_schedules", label: "PM Schedules", tiers: ["read", "write:safe"] },
  { key: "parts", label: "Parts", tiers: ["read", "write:safe"] },
  { key: "requisitions", label: "Requisitions", tiers: ["read", "write:safe"] },
  { key: "purchase_orders", label: "Purchase Orders", tiers: ["read"] },
  { key: "vendors", label: "Vendors", tiers: ["read", "write:safe"] },
  { key: "products", label: "Products", tiers: ["read", "write:safe"] },
  { key: "projects", label: "Projects", tiers: ["read", "write:safe"] },
];

export function scopeString(resource: string, tier: ApiScopeTier): string {
  return `${resource}:${tier}`;
}

export function tierLabel(tier: ApiScopeTier): string {
  switch (tier) {
    case "read":
      return "Read";
    case "write:safe":
      return "Write";
    case "write:sensitive":
      return "Write (sensitive)";
  }
}

const ALL_SCOPE_STRINGS = new Set(
  API_SCOPE_RESOURCES.flatMap((resource) => resource.tiers.map((tier) => scopeString(resource.key, tier)))
);

export function isKnownScope(scope: string): boolean {
  return ALL_SCOPE_STRINGS.has(scope);
}
