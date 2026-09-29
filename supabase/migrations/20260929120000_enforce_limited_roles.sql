-- Enforce the limited app roles the Users settings page describes but nothing
-- enforced (any org member could write every Equipt table):
--   viewer    — read-only everywhere;
--   requestor — may only create maintenance requests and keep their OWN
--               requisitions in draft (plus their line items, and comments /
--               attachments they create); can't submit for approval;
--   purchaser — work orders (and WO parts/labor/vendor charges) are read-only.
-- RESTRICTIVE insert/update/delete policies on every org-scoped table that has
-- a permissive policy (deny-all tables are left alone), in the same style as
-- read_only_when_canceled_*. SECURITY DEFINER writers bypass RLS, so the
-- shared _org_mismatch() guard (18 RPCs), submit_for_approval and
-- crm_reconcile_invoice_payments also refuse viewers/requestors.
-- Portal users and service-role/cron calls (my_role() NULL) are unaffected.
-- New org tables need the three policies added (re-run the DO block).

create or replace function public._role_write_blocked()
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(auth.role(), '') <> 'service_role'
     and coalesce(public.my_role(), '') in ('viewer', 'requestor');
$$;
revoke all on function public._role_write_blocked() from public, anon, authenticated;

-- created_by has no default on these; the requestor "own rows" rule keys on it.
create or replace function public.set_created_by_from_auth()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.created_by is null and auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function public.set_created_by_from_auth() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['maintenance_requests', 'requisitions', 'comments', 'attachments'] loop
    execute format('drop trigger if exists trg_%1$s_created_by on public.%1$I', t);
    execute format('create trigger trg_%1$s_created_by before insert on public.%1$I for each row execute function public.set_created_by_from_auth()', t);
  end loop;
end $$;

CREATE OR REPLACE FUNCTION public._org_mismatch(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when auth.role() = 'service_role' then false
    when auth.role() is null and auth.uid() is null then false  -- in-database (cron/trigger) call, no JWT
    when public._role_write_blocked() then true  -- viewer / requestor: read-only for these writers
    else p_org is distinct from public.my_org_id()
  end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_for_approval(p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_org       uuid;
  v_role      text;
  v_total     integer;
  v_ent_org   uuid;
  v_ent_status text;
  v_approved_total integer;
  v_flow_id   uuid;
  v_step      record;
  v_required  boolean;
  v_bypass    boolean;
  v_status    text;
  v_pending   integer := 0;
  v_approved_steps uuid[];
BEGIN
  SELECT org_id, role INTO v_org, v_role
    FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  -- Viewers are read-only; requestors may only keep requisitions in draft.
  IF v_role IN ('viewer', 'requestor') THEN
    RAISE EXCEPTION 'Your role can''t submit records for approval' USING ERRCODE = '42501';
  END IF;

  IF p_entity_type = 'requisition' THEN
    IF v_role = 'crew' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
    SELECT org_id, grand_total, status, approved_total_cents
      INTO v_ent_org, v_total, v_ent_status, v_approved_total
      FROM public.requisitions WHERE id = p_entity_id AND deleted_at IS NULL;
  ELSIF p_entity_type = 'purchase_order' THEN
    IF v_role = 'crew' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
    SELECT org_id, grand_total, status, approved_total_cents
      INTO v_ent_org, v_total, v_ent_status, v_approved_total
      FROM public.purchase_orders WHERE id = p_entity_id AND deleted_at IS NULL;
  ELSIF p_entity_type = 'crm_estimate' THEN
    IF NOT has_crm_access() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
    SELECT org_id, total_cents INTO v_ent_org, v_total
      FROM public.estimates WHERE id = p_entity_id AND deleted_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Unknown approval entity type %', p_entity_type;
  END IF;

  IF v_ent_org IS NULL OR v_ent_org <> v_org THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'P0002';
  END IF;
  v_total := coalesce(v_total, 0);

  -- Past the approval stage: re-opening approval would flip an ordered /
  -- received record back to pending. Admin-only.
  IF v_ent_status IN ('ordered', 'partially_fulfilled', 'completed', 'closed')
     AND v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'This % is already % — only an admin can resubmit it for approval',
      replace(p_entity_type, '_', ' '), replace(v_ent_status, '_', ' ')
      USING ERRCODE = '42501';
  END IF;

  PERFORM public._approval_set_entity_status(p_entity_type, p_entity_id, 'pending');

  SELECT id INTO v_flow_id FROM public.approval_flows
   WHERE org_id = v_org AND entity_type = p_entity_type AND deleted_at IS NULL
   LIMIT 1;

  DELETE FROM public.approval_requests
   WHERE entity_type = p_entity_type AND entity_id = p_entity_id
     AND NOT archived AND status IN ('pending', 'superseded');
  UPDATE public.approval_requests SET archived = true
   WHERE entity_type = p_entity_type AND entity_id = p_entity_id
     AND NOT archived AND status IN ('rejected', 'skipped');

  -- An approval only covers the total its approver saw. If the total grew
  -- past it, archive the approval so that step is asked again.
  UPDATE public.approval_requests SET archived = true
   WHERE entity_type = p_entity_type AND entity_id = p_entity_id
     AND NOT archived AND status = 'approved'
     AND (
       (entity_total_cents IS NOT NULL AND v_total > entity_total_cents)
       OR (entity_total_cents IS NULL AND (v_approved_total IS NULL OR v_total > v_approved_total))
     );

  IF v_flow_id IS NOT NULL THEN
    SELECT coalesce(array_agg(flow_step_id), '{}') INTO v_approved_steps
      FROM public.approval_requests
     WHERE entity_type = p_entity_type AND entity_id = p_entity_id
       AND NOT archived AND status = 'approved' AND flow_step_id IS NOT NULL;

    FOR v_step IN
      SELECT * FROM public.approval_flow_steps WHERE flow_id = v_flow_id ORDER BY "order"
    LOOP
      CONTINUE WHEN v_step.id = ANY (v_approved_steps);

      v_required := v_step.threshold_cents = 0 OR v_total >= v_step.threshold_cents;
      v_bypass := v_role = 'admin' AND v_step.required_role = 'manager';
      v_status := CASE WHEN NOT v_required OR v_bypass THEN 'skipped' ELSE 'pending' END;

      IF v_step.assigned_user_id IS NOT NULL THEN
        INSERT INTO public.approval_requests
          (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status, entity_total_cents)
        SELECT v_org, p_entity_type, p_entity_id, v_step.id, v_step."order", v_step.assigned_user_id,
               coalesce((SELECT name FROM public.profiles WHERE id = v_step.assigned_user_id), 'Unknown'),
               v_step.required_role, v_status, v_total;
      ELSIF p_entity_type = 'crm_estimate' THEN
        WITH ins AS (
          INSERT INTO public.approval_requests
            (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status, entity_total_cents)
          SELECT v_org, p_entity_type, p_entity_id, v_step.id, v_step."order", e.user_id,
                 e.first_name || ' ' || e.last_name, v_step.required_role, v_status, v_total
            FROM public.crm_employees e
           WHERE e.org_id = v_org AND e.deleted_at IS NULL AND e.user_id IS NOT NULL
             AND e.crm_role_id::text = v_step.required_role
          RETURNING 1
        ) SELECT count(*) INTO v_pending FROM ins;
      ELSE
        WITH targets AS (
          SELECT id, name FROM public.profiles
           WHERE org_id = v_org AND role = v_step.required_role AND status = 'active'
        ), fallback AS (
          SELECT id, name FROM targets
          UNION ALL
          (SELECT id, name FROM public.profiles
            WHERE org_id = v_org AND role = 'admin' AND status = 'active'
              AND NOT EXISTS (SELECT 1 FROM targets)
            ORDER BY created_at LIMIT 1)
        ), ins AS (
          INSERT INTO public.approval_requests
            (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status, entity_total_cents)
          SELECT v_org, p_entity_type, p_entity_id, v_step.id, v_step."order", f.id, f.name,
                 v_step.required_role, v_status, v_total
            FROM fallback f
          RETURNING 1
        ) SELECT count(*) INTO v_pending FROM ins;
      END IF;

    END LOOP;
  END IF;

  SELECT count(*) INTO v_pending FROM public.approval_requests
   WHERE entity_type = p_entity_type AND entity_id = p_entity_id
     AND NOT archived AND status = 'pending';

  IF v_pending = 0 THEN
    PERFORM public._approval_set_entity_status(p_entity_type, p_entity_id, 'approved');
    RETURN jsonb_build_object('auto_approved', true);
  END IF;

  RETURN jsonb_build_object('auto_approved', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_reconcile_invoice_payments(p_invoice_id uuid)
 RETURNS TABLE(new_status text, moved_to_credit_cents integer, was_newly_paid boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_inv      record;
  v_alloc    record;
  v_excess   integer;
  v_take     integer;
  v_moved    integer := 0;
  v_new_paid integer;
  v_balance  integer;
  v_status   text;
  v_clients  uuid[] := '{}';
  v_client   uuid;
begin
  select i.id, i.org_id, i.client_id, i.status, i.total_cents, i.amount_paid_cents, i.deleted_at
    into v_inv
    from public.crm_invoices i
    where i.id = p_invoice_id
    for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if public._role_write_blocked() then
    raise exception 'Your role is read-only' using errcode = '42501';
  end if;

  if v_inv.org_id is distinct from public.my_org_id() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  -- Nothing can be applied to these (guard trigger); keep them as they are,
  -- except a draft's balance, which simply tracks its total.
  if v_inv.deleted_at is not null or v_inv.status in ('draft', 'void') then
    if v_inv.status = 'draft' and v_inv.deleted_at is null then
      update public.crm_invoices
        set balance_cents = greatest(0, v_inv.total_cents - v_inv.amount_paid_cents)
        where id = p_invoice_id;
    end if;
    return query select v_inv.status, 0, false;
    return;
  end if;

  v_excess := v_inv.amount_paid_cents - v_inv.total_cents;

  if v_excess > 0 then
    for v_alloc in
      select a.id, a.payment_id, a.amount_cents
        from public.crm_payment_allocations a
        where a.invoice_id = p_invoice_id
        order by a.created_at desc, a.id desc
        for update
    loop
      exit when v_excess <= 0;
      v_take := least(v_excess, v_alloc.amount_cents);

      if v_take >= v_alloc.amount_cents then
        delete from public.crm_payment_allocations where id = v_alloc.id;
      else
        update public.crm_payment_allocations
          set amount_cents = amount_cents - v_take
          where id = v_alloc.id;
      end if;

      update public.crm_payments
        set unused_amount_cents = coalesce(unused_amount_cents, 0) + v_take
        where id = v_alloc.payment_id
        returning client_id into v_client;

      -- sync_client_balance() treats a payment with an invoice_id and NO
      -- allocation rows as fully applied; once its last allocation here is
      -- gone, detach it so the moved amount actually shows as credit.
      update public.crm_payments p
        set invoice_id = null
        where p.id = v_alloc.payment_id
          and p.invoice_id = p_invoice_id
          and not exists (select 1 from public.crm_payment_allocations a2 where a2.payment_id = p.id);

      if v_client is not null and not (v_client = any(v_clients)) then
        v_clients := v_clients || v_client;
      end if;

      v_excess := v_excess - v_take;
      v_moved := v_moved + v_take;
    end loop;
  end if;

  v_new_paid := v_inv.amount_paid_cents - v_moved;
  v_balance  := greatest(0, v_inv.total_cents - v_new_paid);
  v_status := case
    when v_new_paid > 0 and v_balance = 0 then 'paid'
    when v_new_paid > 0 then 'partial'
    when v_inv.status in ('paid', 'partial') then 'sent'
    else v_inv.status
  end;

  update public.crm_invoices
    set amount_paid_cents = v_new_paid,
        balance_cents     = v_balance,
        status            = v_status
    where id = p_invoice_id;

  perform public.sync_client_balance(v_inv.client_id);
  foreach v_client in array v_clients loop
    if v_client is distinct from v_inv.client_id then
      perform public.sync_client_balance(v_client);
    end if;
  end loop;

  return query select v_status, v_moved, (v_status = 'paid' and v_inv.status is distinct from 'paid');
end;
$function$;

do $$
declare
  t record;
  expr text;
  wo_tables text[] := array['work_orders', 'wo_parts', 'wo_labor_entries', 'wo_vendor_charges'];
  role_expr text := 'coalesce((select public.my_role()), '''')';
begin
  for t in
    select c.relname
      from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
     where c.relnamespace = 'public'::regnamespace
       and c.relkind = 'r'
       and c.relrowsecurity
       and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.permissive = 'PERMISSIVE')
       and c.relname not in ('notifications', 'support_messages', 'profiles')
  loop
    if t.relname = 'maintenance_requests' then
      expr := format('%1$s <> ''viewer'' and (%1$s <> ''requestor'' or created_by = auth.uid() or requested_by_id = auth.uid())', role_expr);
    elsif t.relname = 'requisitions' then
      expr := format('%1$s <> ''viewer'' and (%1$s <> ''requestor'' or ((created_by = auth.uid() or requested_by_id = auth.uid()) and status = ''draft''))', role_expr);
    elsif t.relname = 'requisition_line_items' then
      expr := format('%1$s <> ''viewer'' and (%1$s <> ''requestor'' or exists (select 1 from public.requisitions r where r.id = requisition_line_items.requisition_id and (r.created_by = auth.uid() or r.requested_by_id = auth.uid()) and r.status = ''draft''))', role_expr);
    elsif t.relname in ('comments', 'attachments') then
      expr := format('%1$s <> ''viewer'' and (%1$s <> ''requestor'' or created_by = auth.uid())', role_expr);
    elsif t.relname = any (wo_tables) then
      expr := format('%s not in (''viewer'', ''requestor'', ''purchaser'')', role_expr);
    else
      expr := format('%s not in (''viewer'', ''requestor'')', role_expr);
    end if;

    execute format('drop policy if exists role_write_guard_ins on public.%I', t.relname);
    execute format('drop policy if exists role_write_guard_upd on public.%I', t.relname);
    execute format('drop policy if exists role_write_guard_del on public.%I', t.relname);
    execute format('create policy role_write_guard_ins on public.%I as restrictive for insert with check (%s)', t.relname, expr);
    execute format('create policy role_write_guard_upd on public.%I as restrictive for update using (%s) with check (%s)', t.relname, expr, expr);
    execute format('create policy role_write_guard_del on public.%I as restrictive for delete using (%s)', t.relname, expr);
  end loop;
end $$;

-- organizations has no org_id column: settings writes are closed to them too.
drop policy if exists role_write_guard_upd on public.organizations;
create policy role_write_guard_upd on public.organizations as restrictive for update
  using (coalesce((select public.my_role()), '') not in ('viewer', 'requestor'));
