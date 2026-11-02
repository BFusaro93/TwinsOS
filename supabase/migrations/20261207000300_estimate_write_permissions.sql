-- estimates and their pricing children now require the Sales > Estimate keys
-- when written straight from an end-user session (see 20261207000100 for the
-- exemptions: service role — the public proposal / portal accept routes and
-- the Stripe deposit paths — cron, /api/v1, SECURITY DEFINER RPCs such as the
-- approval workflow, and trigger cascades; admins always pass).
--
-- There is no estimate_delete key: the list's Delete action is gated on
-- estimate_edit, so soft-deleting needs estimate_edit too.
--
--  estimates insert              estimate_add (created_by is stamped)
--  estimates update / delete     estimate_edit, or
--    * estimate_add on an estimate the caller created that has not been sent
--      yet (building or discarding a new one: New Estimate's totals recalc,
--      Duplicate, Create Estimate from an upsell, bulk import)
--    * estimate_send when only stage / sent_at / expiry_notified_at change
--      (Send and Share Link mark it sent)
--    * job_add when only stage changes, to 'accepted' (Convert to Job)
--  line items, sub-items, line equipment, direct costs
--                                estimate_edit, or estimate_add on an unsent
--                                estimate the caller created
--
-- estimate_milestones are left on has_crm_access: a converted project adopts
-- its estimate's milestones and they are edited from Projects (project keys).
-- estimate_photos are written through routes that already check
-- estimate_edit, with inserts as the service role.
create or replace function public._estimate_is_own_unsent_draft(p_estimate_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.estimates e
    where e.id = p_estimate_id
      and e.created_by = auth.uid()
      and e.sent_at is null
      and e.deleted_at is null
  );
$$;
revoke all on function public._estimate_is_own_unsent_draft(uuid) from public, anon;
grant execute on function public._estimate_is_own_unsent_draft(uuid) to authenticated, service_role;

create or replace function public.enforce_estimate_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    if public.has_settings_permission('estimate_add') then
      return new;
    end if;
    raise exception 'You do not have permission to add estimates'
      using errcode = '42501';
  end if;

  if public.has_settings_permission('estimate_edit') then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    if public.has_settings_permission('estimate_add')
       and old.created_by = auth.uid()
       and old.sent_at is null
       and old.deleted_at is null
       and new.created_by is not distinct from old.created_by then
      return new;
    end if;

    if public.has_settings_permission('estimate_send')
       and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new),
             array['stage', 'sent_at', 'expiry_notified_at']) then
      return new;
    end if;

    if public.has_settings_permission('job_add')
       and new.stage = 'accepted'
       and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new),
             array['stage']) then
      return new;
    end if;
  end if;

  raise exception 'You do not have permission to edit estimates'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_estimates_enforce_write_permission on public.estimates;
create trigger a_estimates_enforce_write_permission
  before insert or update or delete on public.estimates
  for each row
  execute function public.enforce_estimate_write_permission();

-- Children: resolve the parent estimate (directly, or through the line item
-- for sub-items and equipment) for both the old and new row.
create or replace function public.enforce_estimate_child_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_estimate_ids uuid[];
begin
  if not public._crm_direct_user_write()
     or public.has_settings_permission('estimate_edit') then
    return coalesce(new, old);
  end if;

  if public.has_settings_permission('estimate_add') then
    if tg_table_name in ('estimate_line_item_subitems', 'estimate_line_item_equipment') then
      select array_agg(li.estimate_id) into v_estimate_ids
      from public.estimate_line_items li
      where li.id in ((v_new ->> 'line_item_id')::uuid, (v_old ->> 'line_item_id')::uuid);
    else
      v_estimate_ids := array_remove(array[
        (v_new ->> 'estimate_id')::uuid, (v_old ->> 'estimate_id')::uuid], null);
    end if;

    if coalesce(array_length(v_estimate_ids, 1), 0) > 0
       and not exists (
         select 1 from unnest(v_estimate_ids) e(id)
         where not public._estimate_is_own_unsent_draft(e.id)
       ) then
      return coalesce(new, old);
    end if;
  end if;

  raise exception 'You do not have permission to edit estimates'
    using errcode = '42501';
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'estimate_line_items', 'estimate_line_item_subitems',
    'estimate_line_item_equipment', 'estimate_direct_costs'
  ] loop
    execute format('drop trigger if exists a_%1$s_enforce_write_permission on public.%1$I', t);
    execute format(
      'create trigger a_%1$s_enforce_write_permission
         before insert or update or delete on public.%1$I
         for each row execute function public.enforce_estimate_child_write_permission()', t);
  end loop;
end;
$$;
