-- One QuickBooks customer per Landscapt client.
--
-- Customer matching auto-linked an exact-name QuickBooks customer even when
-- another client already held it, so two "John Smith" accounts ended up on one
-- QuickBooks customer and their invoices/payments merged there. The app now
-- creates "<name> (acct #<number>)" instead (src/lib/integrations/quickbooks.ts);
-- this index is the guard behind it.
--
-- Partial: unlinked clients (NULL) and soft-deleted ones are exempt — a client
-- retired by Merge Clients keeps its old qbo_customer_id when the survivor
-- already had its own link.
--
-- Fail-safe: if the database already holds duplicates, the index is NOT
-- created (that would abort the migration); a NOTICE lists how many, and the
-- index can be created once they are relinked. Pre-check:
--   select org_id, qbo_customer_id, count(*), array_agg(id)
--     from public.clients
--    where qbo_customer_id is not null and deleted_at is null
--    group by 1, 2 having count(*) > 1;

do $$
declare
  v_dupes int;
begin
  if exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'clients_org_qbo_customer_unique'
  ) then
    return;
  end if;

  select count(*) into v_dupes
    from (
      select 1
        from public.clients
       where qbo_customer_id is not null and deleted_at is null
       group by org_id, qbo_customer_id
      having count(*) > 1
    ) d;

  if v_dupes > 0 then
    raise notice 'clients_org_qbo_customer_unique NOT created: % QuickBooks customer id(s) are linked to more than one client. Relink them, then re-run this migration.', v_dupes;
    return;
  end if;

  create unique index clients_org_qbo_customer_unique
    on public.clients (org_id, qbo_customer_id)
    where qbo_customer_id is not null and deleted_at is null;
end;
$$;
