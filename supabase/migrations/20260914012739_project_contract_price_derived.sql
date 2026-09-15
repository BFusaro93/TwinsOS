-- contract_price is derived from original_contract_price plus approved change
-- orders, but 20260913210000 only recomputed it when a CHANGE ORDER moved.
-- Editing the original on the project form would then leave contract_price
-- stale -- and contract_price is what the milestone basis, the Analysis tab
-- and rpt_projects_wip all read. Keep the derivation true from both directions.

create or replace function public.fn_projects_sync_contract_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.contract_price := new.original_contract_price + coalesce((
    select sum(co.amount_cents)
    from public.project_change_orders co
    where co.project_id = new.id
      and co.status = 'approved'
      and co.deleted_at is null
  ), 0);
  return new;
end;
$$;

revoke execute on function public.fn_projects_sync_contract_price() from public, anon;

-- BEFORE, so it rewrites the row being written rather than issuing a second
-- UPDATE that would re-enter this trigger.
drop trigger if exists trg_projects_sync_contract_price on public.projects;
create trigger trg_projects_sync_contract_price
  before insert or update of original_contract_price on public.projects
  for each row execute function public.fn_projects_sync_contract_price();

-- Anything created before original_contract_price existed still carries its
-- whole value in contract_price; make the two agree.
update public.projects
set original_contract_price = contract_price
where original_contract_price = 0 and contract_price <> 0;
