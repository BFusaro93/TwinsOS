-- Price adjustment runs: make totals quantity-weighted.
--
-- crm_job_services.rate_cents is a PER-UNIT rate; a visit bills
-- round(rate_cents * qty) (lineTotalCents in auto-invoice-tax.ts). The preview
-- and the run header's delta_cents summed the per-unit change and ignored qty,
-- so a flat +$1 on a 5,000 sq ft line read as +$1 while it bills +$5,000 per
-- visit.
--
-- This adds `quantity` to the candidate set and to the per-line undo record,
-- and makes the run header's delta_cents the true per-visit change:
--     sum( round(new_rate * qty) - round(old_rate * qty) )
-- (the same per-line rounding the invoice uses, so the number on screen equals
-- the number billed). Packages and package services have no quantity: 1.
--
-- Apply/revert still work on per-unit rates (old_rate_cents/new_rate_cents are
-- unchanged and revert's drift check compares them), so revert is untouched.
--
-- SECURITY NOTE: crm_apply_price_adjustment is replaced below and the in-DB
-- has_settings_permission('pricing_adjustment_run') check is re-stated as its
-- FIRST statement (see 20260913170000 for how it was once silently lost).

-- Return type changes, so the function must be dropped. plpgsql callers
-- (apply) bind by name at run time, so nothing else depends on it.
drop function if exists public.crm_price_adjustment_candidates(text, numeric, text, jsonb, text[]);

create function public.crm_price_adjustment_candidates(
  p_method   text,
  p_amount   numeric,
  p_rounding text,
  p_scope    jsonb,
  p_targets  text[]
)
returns table (
  entity_type    text,
  entity_id      uuid,
  client_id      uuid,
  job_id         uuid,
  label          text,
  old_rate_cents integer,
  new_rate_cents integer,
  quantity       numeric
)
language sql
stable
set search_path to 'public'
as $function$
  with scope as (
    select
      coalesce(array(select jsonb_array_elements_text(p_scope -> 'serviceIds'))::uuid[], '{}') as service_ids,
      coalesce(array(select jsonb_array_elements_text(p_scope -> 'clientIds'))::uuid[],  '{}') as client_ids,
      coalesce(array(select jsonb_array_elements_text(p_scope -> 'jobTypes')),            '{}') as job_types,
      coalesce(array(select jsonb_array_elements_text(p_scope -> 'packageIds'))::uuid[],  '{}') as package_ids
  )
  -- Live job service lines: the layer that actually bills.
  select
    'job_service'::text,
    js.id,
    j.client_id,
    j.id,
    coalesce(c.display_name, 'Client') || ' · ' || coalesce(js.service_name, 'Service')
      || ' (Job #' || j.job_number || ')',
    js.rate_cents,
    crm_adjust_price_cents(js.rate_cents, p_method, p_amount, p_rounding),
    coalesce(js.qty, 1)::numeric
  from crm_job_services js
  join crm_jobs j on j.id = js.job_id
  left join clients c on c.id = j.client_id
  cross join scope s
  where 'job_service' = any(p_targets)
    and js.org_id = my_org_id()
    and j.deleted_at is null
    and js.rate_cents is not null
    and coalesce(js.included, true)
    -- Finished and abandoned work is history; only future billing moves.
    and j.status not in ('completed', 'cancelled', 'skipped')
    and (cardinality(s.service_ids) = 0 or js.service_id = any(s.service_ids))
    and (cardinality(s.client_ids)  = 0 or j.client_id   = any(s.client_ids))
    and (cardinality(s.job_types)   = 0 or j.job_type    = any(s.job_types))

  union all

  -- Fixed monthly package installments (a flat amount: quantity 1).
  select
    'package'::text,
    p.id,
    null::uuid,
    null::uuid,
    'Package · ' || p.name,
    p.monthly_amount_cents,
    crm_adjust_price_cents(p.monthly_amount_cents, p_method, p_amount, p_rounding),
    1::numeric
  from crm_packages p
  cross join scope s
  where 'package' = any(p_targets)
    and p.org_id = my_org_id()
    and p.deleted_at is null
    and p.monthly_amount_cents is not null
    and (cardinality(s.package_ids) = 0 or p.id = any(s.package_ids))

  union all

  -- Per-service rates inside a package (no quantity column: 1).
  select
    'package_service'::text,
    ps.id,
    null::uuid,
    null::uuid,
    'Package · ' || coalesce(p.name, '?') || ' · ' || coalesce(ps.service_name, ps.name, 'Service'),
    ps.default_rate_cents,
    crm_adjust_price_cents(ps.default_rate_cents, p_method, p_amount, p_rounding),
    1::numeric
  from crm_package_services ps
  join crm_packages p on p.id = ps.package_id
  cross join scope s
  where 'package_service' = any(p_targets)
    and ps.org_id = my_org_id()
    and ps.deleted_at is null
    and p.deleted_at is null
    and ps.default_rate_cents is not null
    and (cardinality(s.package_ids) = 0 or ps.package_id = any(s.package_ids))
    and (cardinality(s.service_ids) = 0 or ps.service_id = any(s.service_ids))
$function$;

-- Dropping the function reset its grants. Same posture as 20260909230000 /
-- 20260919040000: security invoker, callable by signed-in users only.
revoke execute on function public.crm_price_adjustment_candidates(text, numeric, text, jsonb, text[]) from public, anon;
grant  execute on function public.crm_price_adjustment_candidates(text, numeric, text, jsonb, text[]) to authenticated;

-- Quantity captured on each undo line so the history total can be re-derived.
alter table public.crm_price_adjustment_lines
  add column if not exists quantity numeric not null default 1;

create or replace function public.crm_apply_price_adjustment(
  p_name     text,
  p_method   text,
  p_amount   numeric,
  p_rounding text,
  p_scope    jsonb,
  p_targets  text[],
  p_notes    text  default null,
  p_selected jsonb default null
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_id    uuid;
  v_org   uuid := my_org_id();
  v_count integer;
  v_delta bigint;
begin
  -- MUST stay first. See 20260913170000 and the header of this migration.
  if not coalesce(has_settings_permission('pricing_adjustment_run'), false) then
    raise exception 'Not permitted to run price adjustments'
      using errcode = 'insufficient_privilege';
  end if;

  if v_org is null then
    raise exception 'crm_apply_price_adjustment: no org for current user';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'crm_apply_price_adjustment: name is required';
  end if;
  if p_selected is not null and jsonb_typeof(p_selected) <> 'array' then
    raise exception 'crm_apply_price_adjustment: p_selected must be a JSON array';
  end if;

  insert into crm_price_adjustments (
    org_id, name, method, amount, rounding, scope, targets, notes,
    applied_by, created_by
  )
  values (
    v_org, btrim(p_name), p_method, p_amount, p_rounding,
    coalesce(p_scope, '{}'::jsonb), p_targets, p_notes,
    auth.uid(), auth.uid()
  )
  returning id into v_id;

  insert into crm_price_adjustment_lines (
    org_id, adjustment_id, entity_type, entity_id, client_id, job_id,
    label, old_rate_cents, new_rate_cents, quantity
  )
  select v_org, v_id, c.entity_type, c.entity_id, c.client_id, c.job_id,
         c.label, c.old_rate_cents, c.new_rate_cents, c.quantity
  from crm_price_adjustment_candidates(p_method, p_amount, p_rounding, p_scope, p_targets) c
  where c.new_rate_cents is distinct from c.old_rate_cents
    and (
      p_selected is null
      or exists (
        select 1
        from jsonb_to_recordset(p_selected)
          as sel(entity_type text, entity_id uuid, old_rate_cents integer)
        where sel.entity_type = c.entity_type
          and sel.entity_id   = c.entity_id
          -- Price moved since the preview: skip rather than apply an increase
          -- calculated from a number the user never approved.
          and sel.old_rate_cents = c.old_rate_cents
      )
    );

  update crm_job_services js
  set rate_cents = l.new_rate_cents
  from crm_price_adjustment_lines l
  where l.adjustment_id = v_id
    and l.entity_type = 'job_service'
    and js.id = l.entity_id
    and js.org_id = v_org;

  update crm_packages p
  set monthly_amount_cents = l.new_rate_cents,
      updated_at = now()
  from crm_price_adjustment_lines l
  where l.adjustment_id = v_id
    and l.entity_type = 'package'
    and p.id = l.entity_id
    and p.org_id = v_org;

  update crm_package_services ps
  set default_rate_cents = l.new_rate_cents
  from crm_price_adjustment_lines l
  where l.adjustment_id = v_id
    and l.entity_type = 'package_service'
    and ps.id = l.entity_id
    and ps.org_id = v_org;

  -- True per-visit change: each line bills round(rate * qty).
  select count(*),
         coalesce(sum(round(new_rate_cents * quantity) - round(old_rate_cents * quantity)), 0)
  into v_count, v_delta
  from crm_price_adjustment_lines
  where adjustment_id = v_id;

  if v_count = 0 then
    raise exception 'crm_apply_price_adjustment: none of the selected lines still match the preview — re-run the preview and try again';
  end if;

  update crm_price_adjustments
  set line_count = v_count, delta_cents = v_delta, updated_at = now()
  where id = v_id;

  return v_id;
end;
$function$;

revoke execute on function public.crm_apply_price_adjustment(text, text, numeric, text, jsonb, text[], text, jsonb) from public, anon;
grant  execute on function public.crm_apply_price_adjustment(text, text, numeric, text, jsonb, text[], text, jsonb) to authenticated;
