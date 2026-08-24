-- sync_client_balance() (20260619000012) is only called from specific app code paths
-- (invoice save/void/update). Bulk-imported invoices never call it, so imported clients'
-- balance_outstanding_cents stays 0 until the invoice is opened and resaved once. Move
-- the recompute into a trigger so it happens for every insert/update/delete of an
-- invoice, regardless of which code path wrote it.
create or replace function trg_sync_client_balance_on_invoice_change()
returns trigger language plpgsql security definer as $$
begin
  if (tg_op = 'DELETE') then
    perform sync_client_balance(old.client_id);
    return old;
  end if;

  perform sync_client_balance(new.client_id);
  if (tg_op = 'UPDATE' and old.client_id is distinct from new.client_id) then
    perform sync_client_balance(old.client_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_invoices_sync_balance on crm_invoices;
create trigger trg_crm_invoices_sync_balance
  after insert or update or delete on crm_invoices
  for each row execute function trg_sync_client_balance_on_invoice_change();

-- Backfill balances for any client whose invoices were imported before this trigger existed.
do $$
declare
  c record;
begin
  for c in select distinct client_id from crm_invoices where deleted_at is null loop
    perform sync_client_balance(c.client_id);
  end loop;
end;
$$;
