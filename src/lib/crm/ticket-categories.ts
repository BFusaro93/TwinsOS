/**
 * Default ticket categories, used as a fallback when an org has no
 * `ticket_categories` list options. Must match the set seeded for every org by
 * fn_seed_default_ticket_categories (migration 20261027000000).
 */
export const DEFAULT_TICKET_CATEGORIES = [
  "Uncategorized",
  "Estimate",
  "Billing",
  "Change Service",
  "Schedule Service",
  "Complaint",
  "Damage / Warranty",
  "Need to Contact Customer",
  "Client Portal Message",
  "Terminate Service",
  "Other",
  "Upsell",
] as const;
