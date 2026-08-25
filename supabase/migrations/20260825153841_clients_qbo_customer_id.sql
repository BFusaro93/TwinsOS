-- QuickBooks sync Phase 2: one QBO customer per client, no sub-customer
-- hierarchy (a deliberate simplification — every client, parent or child,
-- gets its own top-level QBO customer). Mirrors the existing
-- clients.stripe_customer_id precedent: an external-system ID stored
-- directly on the row, not a separate mapping table.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS qbo_customer_id text;
