-- Enforce pricing_adjustment_run INSIDE the price-adjustment RPCs.
--
-- 20260909230000 granted crm_apply_price_adjustment and
-- crm_revert_price_adjustment to `authenticated` and put the only permission
-- check in the Next route (src/lib/pricing/authorize.ts). That file's own
-- comment claims the key is "enforced server-side as well as in the UI" — it
-- was not, for anyone who skips the route. Supabase hands every signed-in user
-- the anon key and a session, so `supabase.rpc('crm_apply_price_adjustment',
-- ...)` from a browser console bypassed the gate entirely. RLS does not help:
-- crm_job_services' policy is org-scoped plus the has_crm_access() restrictive
-- gate, both of which an ordinary employee satisfies.
--
-- Verified on PROD before this fix: a user with role 'technician' whose
-- has_settings_permission('pricing_adjustment_run') returns FALSE successfully
-- re-priced 41 live job-service lines by +25% (+$8,313.50) in one call.
-- (Probe was rolled back.)
--
-- The check goes in the function body rather than being revoked from
-- `authenticated`, because the routes deliberately call these as the signed-in
-- user (so my_org_id() and auth.uid() resolve) rather than through a
-- service-role client. has_settings_permission() already returns true for
-- admins, so the legitimate path is unaffected.
create or replace function public.crm_apply_price_adjustment(
  p_name     text,
  p_method   text,
  p_amount   numeric,
  p_rounding text,
  p_scope    jsonb,
  p_targets  text[],
  p_notes    text default null
)
returns uuid
language plpgsql
as $$
declare
  v_id    uuid;
  v_org   uuid := my_org_id();
  v_count integer;
  v_delta bigint;
begin
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
    label, old_rate_cents, new_rate_cents
  )
  select v_org, v_id, c.entity_type, c.entity_id, c.client_id, c.job_id,
         c.label, c.old_rate_cents, c.new_rate_cents
  from crm_price_adjustment_candidates(p_method, p_amount, p_rounding, p_scope, p_targets) c
  where c.new_rate_cents is distinct from c.old_rate_cents;

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

  select count(*), coalesce(sum(new_rate_cents - old_rate_cents), 0)
  into v_count, v_delta
  from crm_price_adjustment_lines
  where adjustment_id = v_id;

  update crm_price_adjustments
  set line_count = v_count, delta_cents = v_delta, updated_at = now()
  where id = v_id;

  return v_id;
end;
$$;

-- Revert carries the same authority as apply — it moves prices back, which is
-- just as much a billing change — and additionally takes FOR UPDATE on the run
-- header. Without the lock two overlapping reverts both saw status='applied';
-- once the first committed, the second's drift check found every live value
-- already sitting at old_rate_cents and so flagged every line
-- revert_skipped=true, permanently recording "a human re-priced this" about
-- lines that were cleanly restored.
create or replace function public.crm_revert_price_adjustment(p_id uuid)
returns table (reverted integer, skipped integer)
language plpgsql
as $$
declare
  v_org       uuid := my_org_id();
  v_status    text;
  v_reverted  integer := 0;
  v_skipped   integer := 0;
  v_n         integer;
begin
  if not coalesce(has_settings_permission('pricing_adjustment_run'), false) then
    raise exception 'Not permitted to revert price adjustments'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_status
  from crm_price_adjustments
  where id = p_id and org_id = v_org and deleted_at is null
  for update;

  if v_status is null then
    raise exception 'crm_revert_price_adjustment: run % not found', p_id;
  end if;
  if v_status = 'reverted' then
    raise exception 'crm_revert_price_adjustment: run % is already reverted', p_id;
  end if;

  update crm_price_adjustment_lines l
  set revert_skipped = true
  where l.adjustment_id = p_id
    and l.org_id = v_org
    and (
      (l.entity_type = 'job_service' and not exists (
        select 1 from crm_job_services js
        where js.id = l.entity_id and js.rate_cents = l.new_rate_cents))
      or (l.entity_type = 'package' and not exists (
        select 1 from crm_packages p
        where p.id = l.entity_id and p.monthly_amount_cents = l.new_rate_cents))
      or (l.entity_type = 'package_service' and not exists (
        select 1 from crm_package_services ps
        where ps.id = l.entity_id and ps.default_rate_cents = l.new_rate_cents))
    );
  get diagnostics v_skipped = row_count;

  update crm_job_services js
  set rate_cents = l.old_rate_cents
  from crm_price_adjustment_lines l
  where l.adjustment_id = p_id
    and l.org_id = v_org
    and l.entity_type = 'job_service'
    and not l.revert_skipped
    and js.id = l.entity_id
    and js.org_id = v_org;
  get diagnostics v_n = row_count;
  v_reverted := v_reverted + v_n;

  update crm_packages p
  set monthly_amount_cents = l.old_rate_cents,
      updated_at = now()
  from crm_price_adjustment_lines l
  where l.adjustment_id = p_id
    and l.org_id = v_org
    and l.entity_type = 'package'
    and not l.revert_skipped
    and p.id = l.entity_id
    and p.org_id = v_org;
  get diagnostics v_n = row_count;
  v_reverted := v_reverted + v_n;

  update crm_package_services ps
  set default_rate_cents = l.old_rate_cents
  from crm_price_adjustment_lines l
  where l.adjustment_id = p_id
    and l.org_id = v_org
    and l.entity_type = 'package_service'
    and not l.revert_skipped
    and ps.id = l.entity_id
    and ps.org_id = v_org;
  get diagnostics v_n = row_count;
  v_reverted := v_reverted + v_n;

  update crm_price_adjustments
  set status = 'reverted', reverted_at = now(), reverted_by = auth.uid(), updated_at = now()
  where id = p_id and org_id = v_org;

  return query select v_reverted, v_skipped;
end;
$$;
