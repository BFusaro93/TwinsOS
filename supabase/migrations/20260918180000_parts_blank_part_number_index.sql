-- product_items and parts disagreed about blank part numbers:
--
--   uq_product_items_org_part_number ... WHERE part_number <> '' AND deleted_at IS NULL
--   uq_parts_org_part_number         ... WHERE                       deleted_at IS NULL
--
-- So a catalog may hold many products with no part number, but an org could
-- only ever have ONE part with a blank one. Since a maintenance_part product is
-- mirrored into parts, the second such product created without a part number
-- collided on 23505 — and because the recovery branch keyed off a part number
-- that wasn't supplied, the request 500'd after the catalog row had already
-- committed, leaving a product with no mirrored part (which then silently skips
-- its inventory increment at goods receipt).
--
-- The API now pre-flights the mirror so no orphan can be created either way,
-- but the asymmetry itself is the root cause, and there is no reason parts
-- should be stricter than the catalog it mirrors. Matching the predicates fixes
-- it at the source.
--
-- Verified before applying: 1 blank-part-number row on PROD, so relaxing the
-- constraint cannot fail, and no uniqueness that anything relies on is lost —
-- real part numbers stay unique per org exactly as before.
drop index if exists public.uq_parts_org_part_number;

create unique index if not exists uq_parts_org_part_number
  on public.parts (org_id, part_number)
  where part_number <> '' and deleted_at is null;
