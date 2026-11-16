-- Bug sweep round 14 (4xx) F1: a converted estimate could still be re-priced.
--
-- guard_converted_estimate_line froze a converted line's qty / rate / visits /
-- discount, but three other things that set the price were open:
--   1. the estimate header's discount_type / discount_value / tax_rate_bps,
--   2. priced sub-items under a converted line (they are copied to the job
--      only at convert time, so a later one never reached the crew or the
--      bill),
--   3. the converted line's status: moving it to lost / draft dropped it
--      from the estimate total while its job kept billing it.
-- On a multi-pass convert the header discount split (netByLine) is
-- recomputed from the CURRENT header, so changing it between passes made the
-- jobs add up to neither the old price nor the new one.
--
-- Direct user writes only (_crm_direct_user_write): service role, SECURITY
-- DEFINER RPCs and trigger cascades keep working.
--
-- PROD: apply BEFORE or AFTER the code deploy — the UI already disables these
-- fields on converted lines, and old code only hits the new errors on edits
-- that are now refused on purpose.

-- 1. Header discount / tax on an estimate with a converted line.
create or replace function public.guard_converted_estimate_header()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if not public._crm_direct_user_write() then
    return new;
  end if;

  if new.discount_type is not distinct from old.discount_type
     and new.discount_value is not distinct from old.discount_value
     and new.tax_rate_bps is not distinct from old.tax_rate_bps then
    return new;
  end if;

  -- recalcEstimateTotals records a legacy flat discount's intent (discount_value
  -- was null) without changing the price: allow exactly that.
  if old.discount_value is null
     and coalesce(old.discount_type, 'flat') = 'flat'
     and new.discount_type = 'flat'
     and new.discount_value is not distinct from old.discount_cents
     and new.tax_rate_bps is not distinct from old.tax_rate_bps then
    return new;
  end if;

  if exists (
    select 1 from public.estimate_line_items li
     where li.estimate_id = new.id
       and li.deleted_at is null
       and public._estimate_line_is_converted(li.id)
  ) then
    raise exception 'This estimate is already on a job — its discount and tax rate can''t change. Change the price on the job instead.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists b_estimates_guard_converted_header on public.estimates;
create trigger b_estimates_guard_converted_header
  before update of discount_type, discount_value, tax_rate_bps on public.estimates
  for each row execute function public.guard_converted_estimate_header();

-- 2. Priced sub-items under a converted line.
create or replace function public.guard_converted_estimate_subitem()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    if new.line_item_id is not distinct from old.line_item_id
       and new.qty is not distinct from old.qty
       and new.rate_cents is not distinct from old.rate_cents
       and new.total_cents is not distinct from old.total_cents
       and new.visits is not distinct from old.visits
       and new.type is not distinct from old.type
       and new.product_id is not distinct from old.product_id
       and new.service_id is not distinct from old.service_id
       and new.deleted_at is not distinct from old.deleted_at then
      return new;
    end if;
  end if;

  if (tg_op in ('UPDATE', 'DELETE') and public._estimate_line_is_converted(old.line_item_id))
     or (tg_op in ('INSERT', 'UPDATE') and public._estimate_line_is_converted(new.line_item_id)) then
    raise exception 'This line is already on a job — add or change its products and services on the job instead.'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists b_estimate_line_item_subitems_guard_converted on public.estimate_line_item_subitems;
create trigger b_estimate_line_item_subitems_guard_converted
  before insert or update or delete on public.estimate_line_item_subitems
  for each row execute function public.guard_converted_estimate_subitem();

-- 3. The line guard, now also refusing a converted line moving to lost / draft
--    (live definition from TEST, status added).
create or replace function public.guard_converted_estimate_line()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
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
       and new.deleted_at is not distinct from old.deleted_at
       -- A line on a job that drops to lost / draft leaves the estimate total
       -- while the job keeps billing it.
       and not (new.status is distinct from old.status and new.status in ('lost', 'draft')) then
      return new;
    end if;
  end if;

  if public._estimate_line_is_converted(old.id) then
    raise exception 'This line is already on a job — change its price on the job instead.'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$function$;
