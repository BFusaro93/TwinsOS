-- A line that has been converted to a job keeps the job's price.
--
-- Bulk Rate Increase already skipped converted lines, but each line could
-- still be re-priced, re-quantified or deleted one at a time from the grid,
-- leaving the estimate (and anything priced off it: the proposal, the approval
-- amount, a later Invoice) disagreeing with the job the client is actually
-- being billed from.
--
-- A line is converted when a live (not deleted) job has a service linked to it
-- (crm_job_services.estimate_line_item_id) — the same rule the app uses
-- (useEstimateConvertedLines). A live job from the estimate with no linked
-- services at all predates line tracking; then every line of that estimate is
-- treated as converted, again matching the app.
--
-- Guarded for end-user sessions only (_crm_direct_user_write): price inputs
-- (qty, rate, adj rate, visits, calc type, complexity, total, the discount
-- itself) and deletion. discount_cents is derived from total + discount and is
-- re-synced by recalcEstimateTotals, so it is left alone; costing fields,
-- notes, sort order and status are not price changes.

create or replace function public._estimate_line_is_converted(p_line_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.estimate_line_items li
    where li.id = p_line_id
      and not public._org_mismatch(li.org_id)
      and (
        exists (
          select 1
          from public.crm_job_services js
          join public.crm_jobs j on j.id = js.job_id
          where js.estimate_line_item_id = li.id
            and j.deleted_at is null
        )
        or exists (
          select 1
          from public.crm_jobs j
          where j.estimate_id = li.estimate_id
            and j.deleted_at is null
            and not exists (
              select 1 from public.crm_job_services js
              where js.job_id = j.id and js.estimate_line_item_id is not null
            )
        )
      )
  );
$$;

revoke all on function public._estimate_line_is_converted(uuid) from public, anon;
grant execute on function public._estimate_line_is_converted(uuid) to authenticated, service_role;

create or replace function public.guard_converted_estimate_line()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    -- Nothing price-related changed: nothing to guard.
    if new.qty is not distinct from old.qty
       and new.rate_cents is not distinct from old.rate_cents
       and new.adj_rate_cents is not distinct from old.adj_rate_cents
       and new.visits is not distinct from old.visits
       and new.calc_type is not distinct from old.calc_type
       and new.complexity_bps is not distinct from old.complexity_bps
       and new.total_cents is not distinct from old.total_cents
       and new.discount_type is not distinct from old.discount_type
       and new.discount_value is not distinct from old.discount_value
       and new.deleted_at is not distinct from old.deleted_at then
      return new;
    end if;
  end if;

  if public._estimate_line_is_converted(old.id) then
    raise exception 'This line is already on a job — change its price on the job instead.'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.guard_converted_estimate_line() from public, anon, authenticated;

drop trigger if exists b_estimate_line_items_guard_converted on public.estimate_line_items;
create trigger b_estimate_line_items_guard_converted
  before update or delete on public.estimate_line_items
  for each row execute function public.guard_converted_estimate_line();
