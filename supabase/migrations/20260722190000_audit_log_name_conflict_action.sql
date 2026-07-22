-- Add a dedicated audit_log action for catalog name conflicts detected during
-- PO CSV import (importDenormalized in use-purchase-orders.ts), so a name
-- mismatch is recorded instead of being silently discarded.
alter table audit_log drop constraint audit_log_action_check;

alter table audit_log add constraint audit_log_action_check
  check (action = any (array[
    'created', 'updated', 'status_changed', 'qty_adjusted', 'price_updated',
    'vendor_changed', 'image_uploaded', 'deleted', 'archived', 'unarchived',
    'received', 'name_conflict'
  ]::text[]));
