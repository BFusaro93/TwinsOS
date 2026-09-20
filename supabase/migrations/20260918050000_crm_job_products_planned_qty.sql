-- crm_job_products.qty is overloaded: it means "planned/called-for quantity"
-- while status = 'pending', but becomes "quantity actually used" once the
-- crew records usage (set_job_product_status decrements inventory by
-- whatever qty holds at that moment). Once qty is overwritten with the
-- actual-used value, the original planned quantity is lost — there's no way
-- to show "planned 10, used 7" side by side. planned_qty is a snapshot of
-- qty at row-creation time, captured once and never touched again.
alter table public.crm_job_products
  add column if not exists planned_qty numeric;

update public.crm_job_products
  set planned_qty = qty
  where planned_qty is null;

-- Applies to every insert path (web app job-product creation, not just the
-- crew-app usage-recording flow this snapshot exists for), so planned_qty
-- always reflects what was actually called for at assignment time.
create or replace function public.set_job_product_planned_qty()
returns trigger
language plpgsql
as $$
begin
  if new.planned_qty is null then
    new.planned_qty := new.qty;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_job_product_planned_qty on public.crm_job_products;
create trigger trg_set_job_product_planned_qty
  before insert on public.crm_job_products
  for each row execute function public.set_job_product_planned_qty();
