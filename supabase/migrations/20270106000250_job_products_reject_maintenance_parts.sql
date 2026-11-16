-- Landscapt job materials can't be Equipt maintenance parts
-- (bug sweep round 14, finding F9).
--
-- A maintenance_part product mirrors a Parts-inventory row: its stock is
-- written by sync_part_stock_to_product from parts.quantity_on_hand. Used on a
-- Landscapt job, set_job_product_status lowers only the product, and the next
-- movement on the part overwrites the product with the part's quantity — the
-- job usage silently disappears and Parts stock never drops. The Landscapt
-- pickers already leave maintenance parts out; this enforces it for every
-- writer (API, integrations, estimate conversion, service role).
--
-- Checked only when the product is set or changed, so existing rows (none on
-- TEST) can still be edited, resolved and invoiced.
--
-- PROD pre-check (expect 0; any rows found keep working, but list them for
-- the owner):
--   select jp.id, jp.org_id, jp.job_id, jp.status, p.name
--     from public.crm_job_products jp
--     join public.product_items p on p.id = jp.product_id
--    where p.category = 'maintenance_part' and jp.deleted_at is null;
--
-- DEPLOY: BEFORE the code deploy (old code never sends maintenance parts).

create or replace function public.crm_job_products_reject_maintenance_part()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_name text;
begin
  if new.product_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.product_id is not distinct from old.product_id then
    return new;
  end if;

  select p.name into v_name
    from public.product_items p
   where p.id = new.product_id
     and p.category = 'maintenance_part';
  if found then
    raise exception '% is an Equipt maintenance part and can''t be used as a job material. Use a stocked or project material instead.', v_name
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function public.crm_job_products_reject_maintenance_part() from public, anon;

drop trigger if exists trg_crm_job_products_reject_maintenance_part on public.crm_job_products;
create trigger trg_crm_job_products_reject_maintenance_part
  before insert or update of product_id on public.crm_job_products
  for each row execute function public.crm_job_products_reject_maintenance_part();
