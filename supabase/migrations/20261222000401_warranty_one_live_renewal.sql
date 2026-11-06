-- A warranty can be renewed once. Renew left the original active with no guard, so a
-- double-click (or a second tab) created two overlapping renewals. A void or deleted
-- renewal frees the original to be renewed again. The panel hides Renew once a live
-- renewal exists and maps this index's 23505 to "already renewed".
create unique index if not exists crm_warranties_one_live_renewal
  on public.crm_warranties (renewed_from_id)
  where renewed_from_id is not null and deleted_at is null and status <> 'void';
