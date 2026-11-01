-- Fixes from the 2026-10-31 Landscapt sweep.
--
-- 1. set_next_invoice_number ("Start invoices at #N") flips the org onto per_org_numbering,
--    and the estimate / ticket BEFORE INSERT triggers key off that same flag. For an existing
--    org that had numbered estimates and tickets from the global serials, the next estimate
--    came out as #1 and the next ticket as #1 (no counter row yet), colliding with and running
--    backwards from the numbers the org already had. Seed those two counters at the org's
--    current highest number the first time the org is switched over, so they continue.
--
-- 2. enforce_client_sensitive_column_permissions treated '' and NULL as different notes, so a
--    login without client_view_notes could not save ANY edit to a client whose office_notes was
--    NULL (the edit form always posted '' back). Compare blanks as equal.

create or replace function public.set_next_invoice_number(p_next integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid := public.my_org_id();
  v_was_per_org boolean;
begin
  if v_org is null then
    raise exception 'No organization for the current user' using errcode = '42501';
  end if;
  -- The card lives on Settings > Accounting (accounting_settings); the seeded Accounting
  -- role has that key without crm_settings, so accept either.
  if not (public.my_role() in ('admin', 'manager')
          or coalesce(public.has_settings_permission('crm_settings'), false)
          or coalesce(public.has_settings_permission('accounting_settings'), false)) then
    raise exception 'Not permitted to change invoice numbering' using errcode = '42501';
  end if;
  if p_next is null or p_next < 1 or p_next > 2000000000 then
    raise exception 'Invoice number must be between 1 and 2,000,000,000' using errcode = '22023';
  end if;

  select coalesce(per_org_numbering, false) into v_was_per_org from public.organizations where id = v_org for update;

  if not v_was_per_org then
    -- Estimates and tickets switch to per-org counters with the same flag: continue from the
    -- org's current highest number instead of restarting at 1.
    insert into public.entity_number_counters (org_id, entity_type, period, count)
    values (v_org, 'estimate', 'all',
            coalesce((select max(e.estimate_number) from public.estimates e where e.org_id = v_org), 0))
    on conflict (org_id, entity_type, period) do nothing;

    insert into public.entity_number_counters (org_id, entity_type, period, count)
    values (v_org, 'crm_ticket', 'all',
            coalesce((select max(t.ticket_number) from public.crm_tickets t where t.org_id = v_org), 0))
    on conflict (org_id, entity_type, period) do nothing;
  end if;

  update public.organizations set per_org_numbering = true where id = v_org;

  insert into public.entity_number_counters (org_id, entity_type, period, count)
  values (v_org, 'crm_invoice', 'all', p_next - 1)
  on conflict (org_id, entity_type, period) do update set count = p_next - 1;

  return p_next;
end;
$function$;
revoke all on function public.set_next_invoice_number(integer) from public, anon;
grant execute on function public.set_next_invoice_number(integer) to authenticated;

create or replace function public.enforce_client_sensitive_column_permissions()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if nullif(new.office_notes, '') is distinct from nullif(old.office_notes, '')
     and not public.has_settings_permission('client_view_notes') then
    raise exception 'You do not have permission to change client notes'
      using errcode = '42501';
  end if;

  if (new.saved_payment_method_id, new.saved_payment_method_type,
      new.saved_payment_method_summary, new.stripe_customer_id)
     is distinct from
     (old.saved_payment_method_id, old.saved_payment_method_type,
      old.saved_payment_method_summary, old.stripe_customer_id)
     or (new.autopay_enabled is true and old.autopay_enabled is distinct from true) then
    if not (public.has_settings_permission('client_view_credit_card')
            and public.has_settings_permission('acct_add_modify_payments')) then
      raise exception 'You do not have permission to change stored payment details'
        using errcode = '42501';
    end if;
  end if;

  if current_user in ('authenticated', 'anon')
     and (new.balance_outstanding_cents, new.balance_prepay_cents,
          new.balance_credits_cents)
         is distinct from
         (old.balance_outstanding_cents, old.balance_prepay_cents,
          old.balance_credits_cents) then
    if not (public.has_settings_permission('client_view_balance')
            and public.has_settings_permission('acct_add_modify_credits')) then
      raise exception 'You do not have permission to change client balances'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- 3. Deactivating a role that live employees still hold locks every one of them out of
--    Landscapt (has_crm_access requires cr.is_active since 20261201000100). The delete guard
--    already existed; the deactivate path had no guard at all. Re-stated in full.
create or replace function public.crm_roles_block_delete_when_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned integer;
begin
  if (old.deleted_at is null and new.deleted_at is not null)
     or (old.is_active and not new.is_active) then
    select count(*) into v_assigned
    from public.crm_employees ce
    where ce.crm_role_id = old.id
      and ce.deleted_at is null
      and ce.is_active;
    if v_assigned > 0 then
      raise exception '% employee(s) are still assigned to this role. Reassign them to another role first.', v_assigned
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_roles_block_delete_when_assigned on public.crm_roles;
create trigger crm_roles_block_delete_when_assigned
  before update on public.crm_roles
  for each row execute function public.crm_roles_block_delete_when_assigned();
