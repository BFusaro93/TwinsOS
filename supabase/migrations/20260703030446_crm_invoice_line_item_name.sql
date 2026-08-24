-- Add name column to invoice line items (service name, non-editable after creation)
alter table crm_invoice_line_items
  add column if not exists name text;

-- Helper function: recompute a client's balance_outstanding_cents from their invoices
create or replace function sync_client_balance(p_client_id uuid)
returns void language plpgsql security definer as $$
begin
  update clients
  set balance_outstanding_cents = coalesce(
    (select sum(balance_cents)
     from crm_invoices
     where client_id = p_client_id
       and deleted_at is null
       and status != 'void'),
    0
  )
  where id = p_client_id;
end;
$$;
